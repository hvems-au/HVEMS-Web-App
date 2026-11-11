-- Mandatory asset fields as either-or rules (reconciliation §3 item 4, AST-01).
-- * Vehicles: make, model, and a registration OR a VIN. A registration always
--   needs its state.
-- * Equipment: make and model; the asset number (always present) identifies it,
--   so the serial number is optional.
-- * In asset_classes.required_fields an entry like 'registration_number|vin'
--   means "at least one of these", so HVEMS can still change the rules as data.

create or replace function app.asset_field_label(p_field text) returns text
language sql immutable set search_path = '' as $$
  select case p_field
    when 'registration_number' then 'Registration'
    when 'registration_state' then 'Registration state'
    when 'vin' then 'VIN'
    when 'serial_number' then 'Serial number'
    when 'asset_number' then 'Asset number'
    else initcap(replace(p_field, '_', ' ')) end
$$;

create or replace function app.asset_validation_errors(
  p_organisation_id uuid, p_asset_id uuid, p_fields jsonb
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  errs jsonb := '[]'::jsonb;
  cls public.asset_classes%rowtype;
  f text;
  v text;
  dup_reason text := nullif(btrim(coalesce(p_fields ->> 'duplicate_reason', '')), '');
  dup_fields text[] := '{}';
begin
  select * into cls from public.asset_classes where id = (p_fields ->> 'asset_class_id')::uuid and active;
  if cls.id is null then
    return jsonb_build_array(jsonb_build_object('field', 'asset_class_id', 'code', 'invalid_class', 'message', 'Choose a valid asset class'));
  end if;

  -- An entry like 'registration_number|vin' means "at least one of these" (AST-01).
  foreach f in array cls.required_fields loop
    if not exists (select 1 from unnest(string_to_array(f, '|')) alt
                   where nullif(btrim(coalesce(p_fields ->> alt, '')), '') is not null) then
      errs := errs || jsonb_build_object('field', split_part(f, '|', 1), 'code', 'required',
        'message', format('%s is required for %s',
          array_to_string(array(select app.asset_field_label(alt) from unnest(string_to_array(f, '|')) alt), ' or '), cls.name));
    end if;
  end loop;
  -- A registration always needs its state.
  if nullif(btrim(coalesce(p_fields ->> 'registration_number', '')), '') is not null
     and nullif(btrim(coalesce(p_fields ->> 'registration_state', '')), '') is null then
    errs := errs || jsonb_build_object('field', 'registration_state', 'code', 'required',
      'message', 'Choose the state the vehicle is registered in');
  end if;

  if exists (
    select 1 from public.assets a
    where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and lower(a.asset_number) = lower(btrim(p_fields ->> 'asset_number'))
  ) then
    errs := errs || jsonb_build_object('field', 'asset_number', 'code', 'duplicate_asset_number',
      'message', 'Another asset already uses this asset number');
  end if;

  -- Duplicate VIN, serial or registration among current assets needs a reason.
  if nullif(btrim(coalesce(p_fields ->> 'vin', '')), '') is not null and exists (
    select 1 from public.assets a where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and a.archived_at is null and upper(a.vin) = upper(btrim(p_fields ->> 'vin'))) then
    dup_fields := array_append(dup_fields, 'vin');
  end if;
  if nullif(btrim(coalesce(p_fields ->> 'serial_number', '')), '') is not null and exists (
    select 1 from public.assets a where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and a.archived_at is null and upper(a.serial_number) = upper(btrim(p_fields ->> 'serial_number'))) then
    dup_fields := array_append(dup_fields, 'serial_number');
  end if;
  if nullif(btrim(coalesce(p_fields ->> 'registration_number', '')), '') is not null and exists (
    select 1 from public.assets a where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and a.archived_at is null and upper(a.registration_number) = upper(btrim(p_fields ->> 'registration_number'))
      and a.registration_state is not distinct from (p_fields ->> 'registration_state')) then
    dup_fields := array_append(dup_fields, 'registration_number');
  end if;
  if cardinality(dup_fields) > 0 and dup_reason is null then
    foreach f in array dup_fields loop
      errs := errs || jsonb_build_object('field', f, 'code', 'duplicate_needs_reason',
        'message', format('Another current asset has the same %s. Give a reason to save a duplicate.', replace(f, '_', ' ')));
    end loop;
  end if;

  if (p_fields ->> 'owner_type') = 'client_owned' and nullif(p_fields ->> 'client_id', '') is null then
    errs := errs || jsonb_build_object('field', 'client_id', 'code', 'required', 'message', 'Client-owned assets need a client');
  end if;

  return errs;
end $$;

-- Standard and company classes follow the new rules.
update public.asset_classes set required_fields = '{make,model,registration_number|vin}' where category = 'vehicle';
update public.asset_classes set required_fields = '{make,model}' where category = 'equipment';
