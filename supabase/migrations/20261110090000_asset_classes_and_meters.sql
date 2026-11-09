-- 1. Asset classes: HVEMS standard classes plus company-owned classes
--    (decision O-03, extends spec AST-02). A company class belongs to one
--    company, is reused for its future equipment, and is based on a category
--    (vehicle or equipment), so billing, waivers and mandatory fields keep
--    working. The Super Admin can add new standard classes for everyone.
-- 2. Meter readings in either unit: an hours-only asset can also record an
--    odometer reading and vice versa. Doing so, with explicit confirmation by
--    a role that accepts readings, switches the asset to track both.

-- ---------------------------------------------------------------------------
-- 1. Asset classes
-- ---------------------------------------------------------------------------
alter table public.asset_classes
  add column organisation_id uuid references public.organisations (id) on delete cascade,
  add column created_by uuid references auth.users (id) on delete set null,
  add column created_at timestamptz not null default now();

create index asset_classes_org_idx on public.asset_classes (organisation_id) where organisation_id is not null;
create index asset_classes_created_by_idx on public.asset_classes (created_by) where created_by is not null;
-- One active class per name within its scope (standard, or one company).
create unique index asset_classes_scope_name_uidx on public.asset_classes (
  coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name))
) where active;

drop policy asset_classes_read on public.asset_classes;
create policy asset_classes_read on public.asset_classes for select to authenticated using (
  organisation_id is null
  or organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('assets.view_permitted'))::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
  or (select app.is_platform_staff())
);

-- BEGIN CAPABILITY SEED (matrix.ts mirror; the drift test reads every migration)
insert into app.role_capabilities (role, capability) values
  ('owner', 'asset_classes.manage'),
  ('administrator', 'asset_classes.manage'),
  ('fleet_manager', 'asset_classes.manage');
-- END CAPABILITY SEED

create trigger audit_asset_classes after insert or update or delete on public.asset_classes
  for each row execute function app.audit_row_change('organisation_id');

-- Create a class. p_organisation_id null = HVEMS standard class (Super Admin);
-- otherwise a company class (asset_classes.manage in that company).
create or replace function public.create_asset_class(
  p_organisation_id uuid, p_name text, p_category public.asset_category, p_default_meter_type public.meter_type
) returns public.asset_classes
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_kind public.organisation_kind;
  v_required text[];
  v_code text;
  rec public.asset_classes;
begin
  if p_organisation_id is null then
    if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
      perform app.raise('forbidden', 'Only a Super Admin signed in with MFA can add standard asset classes');
    end if;
  else
    perform app.require_capability(p_organisation_id, 'asset_classes.manage');
    select kind into v_kind from public.organisations where id = p_organisation_id;
    if v_kind is distinct from 'company' then
      perform app.raise('assets_company_only', 'Only company organisations keep an equipment register');
    end if;
  end if;
  if char_length(v_name) not between 2 and 80 then
    perform app.raise('invalid_name', 'Enter a class name between 2 and 80 characters');
  end if;
  if p_category is null or p_default_meter_type is null then
    perform app.raise('invalid_class', 'Choose a category and a meter type');
  end if;
  -- A company class can't reuse a standard name, and names are unique per scope.
  if exists (
    select 1 from public.asset_classes
    where active and lower(btrim(name)) = lower(v_name)
      and (organisation_id is null or organisation_id is not distinct from p_organisation_id)
  ) then
    perform app.raise('duplicate_class_name', 'A class with that name already exists');
  end if;

  -- Mandatory fields follow the category's standard rule (spec AST-01).
  select required_fields into v_required from public.asset_classes
  where organisation_id is null and category = p_category and active
  order by sort_order limit 1;

  v_code := 'x_' || translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14), '0123456789', 'ghijklmnop');

  insert into public.asset_classes (code, name, category, default_meter_type, required_fields, sort_order, organisation_id, created_by)
  values (
    v_code, v_name, p_category, p_default_meter_type, coalesce(v_required, '{}'),
    case when p_organisation_id is null
      then coalesce((select max(sort_order) from public.asset_classes where organisation_id is null), 0) + 10
      else 1000 end,
    p_organisation_id, auth.uid()
  )
  returning * into rec;
  return rec;
end $$;

-- An asset may use a standard class or a class of its own company only.
create or replace function app.assets_class_in_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_active boolean;
begin
  if tg_op = 'UPDATE' and new.asset_class_id is not distinct from old.asset_class_id then
    return new;
  end if;
  select organisation_id, active into v_org, v_active from public.asset_classes where id = new.asset_class_id;
  if not found or not v_active or (v_org is not null and v_org <> new.organisation_id) then
    perform app.raise('invalid_class', 'Choose a valid asset class');
  end if;
  return new;
end $$;

create trigger assets_class_in_scope before insert or update of asset_class_id on public.assets
  for each row execute function app.assets_class_in_scope();

-- ---------------------------------------------------------------------------
-- 2. Meter readings in either unit
-- ---------------------------------------------------------------------------
drop function public.record_meter_reading(uuid, public.meter_unit, numeric, timestamptz, public.meter_reading_source, uuid, text, boolean);

create function public.record_meter_reading(
  p_asset_id uuid, p_unit public.meter_unit, p_value numeric,
  p_read_at timestamptz default null, p_source public.meter_reading_source default 'manual',
  p_client_request_id uuid default null, p_lower_reason text default null, p_confirm_jump boolean default false,
  p_add_meter boolean default false
) returns public.meter_readings
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  prev public.meter_readings%rowtype;
  existing public.meter_readings%rowtype;
  v_read_at timestamptz := coalesce(p_read_at, now());
  v_status public.meter_reading_status := 'accepted';
  v_out_of_seq boolean := false;
  v_days numeric;
  v_max numeric;
  v_new_type public.meter_type;
  rec public.meter_readings%rowtype;
begin
  select * into a from public.assets where id = p_asset_id;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'meter_readings.record');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not permitted to operate this asset');
  end if;
  if a.archived_at is not null then
    perform app.raise('asset_archived', 'Readings cannot be added to an archived asset');
  end if;
  if not ((p_unit = 'km' and a.meter_type in ('kilometres', 'both')) or (p_unit = 'hours' and a.meter_type in ('hours', 'both'))) then
    -- The other unit: allowed only with explicit confirmation by a role that
    -- accepts readings; the asset then tracks both (audited via the asset row).
    if not coalesce(p_add_meter, false) then
      perform app.raise('meter_type_mismatch',
        format('This asset doesn''t track %s yet. Confirm to start tracking it as well.', case p_unit when 'km' then 'kilometres' else 'hours' end));
    end if;
    if not app.has_capability(a.organisation_id, 'meter_readings.accept') then
      perform app.raise('forbidden', 'Ask a Fleet Manager or Company Admin to start tracking this meter for the asset');
    end if;
    v_new_type := case
      when a.meter_type = 'none' then (case p_unit when 'km' then 'kilometres' else 'hours' end)::public.meter_type
      else 'both'::public.meter_type end;
    update public.assets set meter_type = v_new_type where id = a.id;
    a.meter_type := v_new_type;
  end if;
  if v_read_at > now() + interval '5 minutes' then
    perform app.raise('read_at_in_future', 'A reading cannot be dated in the future');
  end if;

  -- Idempotent retries return the original record (SoW §7.2 "records sync once").
  if p_client_request_id is not null then
    select * into existing from public.meter_readings
    where organisation_id = a.organisation_id and client_request_id = p_client_request_id;
    if existing.id is not null then
      return existing;
    end if;
  end if;

  select * into prev from public.meter_readings
  where asset_id = a.id and unit = p_unit and status = 'accepted'
  order by read_at desc, created_at desc limit 1;

  if prev.id is not null then
    if v_read_at < prev.read_at then
      v_out_of_seq := true;
      v_status := 'pending_acceptance';
    elsif p_value < prev.value then
      if char_length(btrim(coalesce(p_lower_reason, ''))) < 3 then
        perform app.raise('lower_reading_reason_required',
          format('This reading is lower than the last accepted reading (%s). Give a reason; a manager must accept it.', prev.value),
          jsonb_build_object('previous_value', prev.value));
      end if;
      v_status := 'pending_acceptance';
    else
      v_days := greatest(extract(epoch from (v_read_at - prev.read_at)) / 86400.0, 1);
      v_max := case p_unit when 'km' then app.setting_int('meter.max_km_per_day') else app.setting_int('meter.max_hours_per_day') end;
      if (p_value - prev.value) / v_days > v_max and not coalesce(p_confirm_jump, false) then
        perform app.raise('implausible_jump_confirmation_required',
          format('That is a jump of %s since the last reading. Confirm it is correct.', p_value - prev.value),
          jsonb_build_object('previous_value', prev.value, 'difference', p_value - prev.value));
      end if;
    end if;
  end if;

  insert into public.meter_readings (organisation_id, asset_id, unit, value, read_at, source, status, recorded_by,
    identification_method, lower_reading_reason, jump_confirmed, out_of_sequence, client_request_id)
  values (a.organisation_id, a.id, p_unit, p_value, v_read_at, p_source, v_status, auth.uid(),
    app.current_identification_method(), nullif(btrim(coalesce(p_lower_reason, '')), ''),
    coalesce(p_confirm_jump, false), v_out_of_seq, p_client_request_id)
  returning * into rec;

  if v_status = 'accepted' then
    perform app.refresh_asset_meter(a.id, p_unit);
  end if;
  return rec;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges (new functions are executable by PUBLIC by default)
-- ---------------------------------------------------------------------------
revoke execute on function
  public.create_asset_class(uuid, text, public.asset_category, public.meter_type),
  public.record_meter_reading(uuid, public.meter_unit, numeric, timestamptz, public.meter_reading_source, uuid, text, boolean, boolean)
from public, anon;
grant execute on function
  public.create_asset_class(uuid, text, public.asset_category, public.meter_type),
  public.record_meter_reading(uuid, public.meter_unit, numeric, timestamptz, public.meter_reading_source, uuid, text, boolean, boolean)
to authenticated;
revoke execute on function app.assets_class_in_scope() from public, anon;
