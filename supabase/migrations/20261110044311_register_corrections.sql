-- Approved spec corrections (dev-spec-reconciliation §3, 10 Nov 2026).
--
-- Item 2 (spec B.1): Fleet Managers create and edit equipment and manage
--   clients. `assets.manage` now means the spec's `assets.edit` (create/edit);
--   importing and archiving move to the new `assets.import_archive`
--   (Owner/Administrator only).
-- Item 3 (EXP-03): Viewers can see costs (view only).
-- Item 6 (AST-13): disposal reasons are sold, disposed, transferred out,
--   written off, other. Existing "retired" rows become "disposed".

-- BEGIN CAPABILITY SEED (matrix.ts mirror; the drift test reads every migration)
insert into app.role_capabilities (role, capability) values
  ('fleet_manager', 'assets.manage'),
  ('fleet_manager', 'clients.manage'),
  ('owner', 'assets.import_archive'),
  ('administrator', 'assets.import_archive'),
  ('viewer', 'assets.costs.view');
-- END CAPABILITY SEED

alter type public.asset_disposal rename value 'retired' to 'disposed';
alter type public.asset_disposal add value if not exists 'transferred_out' after 'disposed';
alter type public.asset_disposal add value if not exists 'written_off' after 'transferred_out';

-- Archive: Owner/Administrator; leaving the company (sold or transferred out)
-- needs the open defects and holds acknowledged first (SoW §3.1).
create or replace function public.archive_asset(
  p_asset_id uuid, p_reason text, p_effective_date date,
  p_disposal public.asset_disposal default 'disposed', p_open_issues_acknowledged boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
begin
  select * into a from public.assets where id = p_asset_id for update;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'assets.import_archive');
  if a.archived_at is not null then
    perform app.raise('already_archived', 'This asset is already archived');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Archiving needs a reason');
  end if;
  if p_effective_date is null then
    perform app.raise('effective_date_required', 'Archiving needs an effective date');
  end if;
  -- SoW §3.1: open defects must be acknowledged before an asset is archived for sale.
  if p_disposal::text in ('sold', 'transferred_out') and not coalesce(p_open_issues_acknowledged, false) and exists (
    select 1 from public.asset_condition_causes where asset_id = a.id and resolved_at is null
  ) then
    perform app.raise('open_issues_must_be_acknowledged', 'Acknowledge the open defects and holds before archiving this asset for sale or transfer');
  end if;

  update public.assets
  set archived_at = now(), archive_reason = btrim(p_reason), archive_effective_date = p_effective_date, archive_disposal = p_disposal
  where id = a.id;
  insert into public.asset_count_events (organisation_id, asset_id, delta, reason) values (a.organisation_id, a.id, -1, 'archived');
  perform app.audit('archive', 'assets', a.id, a.organisation_id,
    jsonb_build_object('reason', p_reason, 'effective_date', p_effective_date, 'disposal', p_disposal,
                       'open_issues_acknowledged', p_open_issues_acknowledged));
end $$;

-- Import: Owner/Administrator.
create or replace function public.import_assets(p_organisation_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_max integer := app.setting_int('import.max_rows');
  v_free integer := app.setting_int('pricing.fleet_free_assets');
  v_count integer;
  v_current integer;
  errors jsonb := '[]'::jsonb;
  row_errs jsonb;
  r jsonb;
  i integer := 0;
  v_class uuid;
  v_client uuid;
  v_site uuid;
  v_meter public.meter_type;
  fields jsonb;
  seen_numbers text[] := '{}';
  prepared jsonb := '[]'::jsonb;
  v_asset uuid;
  e jsonb;
begin
  perform app.require_capability(p_organisation_id, 'assets.import_archive');
  if jsonb_typeof(p_rows) <> 'array' then
    perform app.raise('invalid_import', 'Rows must be a list');
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count = 0 then
    perform app.raise('empty_import', 'The file has no rows');
  end if;
  if v_count > v_max then
    perform app.raise('too_many_rows', format('A file can have up to %s rows', v_max));
  end if;

  perform 1 from public.organisations where id = p_organisation_id for update;
  v_current := app.current_asset_count(p_organisation_id);

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    row_errs := '[]'::jsonb;

    select id, default_meter_type into v_class, v_meter
    from public.asset_classes where code = lower(btrim(coalesce(r ->> 'asset_class', ''))) and active;
    if v_class is null then
      row_errs := row_errs || jsonb_build_object('field', 'asset_class', 'code', 'invalid_class',
        'message', 'Unknown asset class. Use one of the class codes in the template.');
    end if;

    v_client := null;
    if nullif(btrim(coalesce(r ->> 'client', '')), '') is not null then
      select id into v_client from public.clients
      where organisation_id = p_organisation_id and archived_at is null and lower(name) = lower(btrim(r ->> 'client'));
      if v_client is null then
        row_errs := row_errs || jsonb_build_object('field', 'client', 'code', 'unknown_client', 'message', 'No client with that name');
      end if;
    end if;
    v_site := null;
    if nullif(btrim(coalesce(r ->> 'site', '')), '') is not null then
      select id into v_site from public.sites
      where organisation_id = p_organisation_id and archived_at is null and lower(name) = lower(btrim(r ->> 'site'));
      if v_site is null then
        row_errs := row_errs || jsonb_build_object('field', 'site', 'code', 'unknown_site', 'message', 'No site with that name');
      end if;
    end if;

    if nullif(btrim(coalesce(r ->> 'registration_state', '')), '') is not null
       and not app.is_au_state(upper(btrim(r ->> 'registration_state'))) then
      row_errs := row_errs || jsonb_build_object('field', 'registration_state', 'code', 'invalid_state', 'message', 'Use QLD, NSW, VIC, SA, WA, TAS, NT or ACT');
    end if;
    if nullif(btrim(coalesce(r ->> 'year', '')), '') is not null and (r ->> 'year') !~ '^\d{4}$' then
      row_errs := row_errs || jsonb_build_object('field', 'year', 'code', 'invalid_year', 'message', 'Year must be four digits');
    end if;
    if coalesce(nullif(lower(btrim(r ->> 'owner_type')), ''), 'own') not in ('own', 'client_owned', 'hired_in') then
      row_errs := row_errs || jsonb_build_object('field', 'owner_type', 'code', 'invalid_owner_type', 'message', 'Use own, client_owned or hired_in');
    end if;
    if nullif(btrim(coalesce(r ->> 'meter_type', '')), '') is not null
       and lower(btrim(r ->> 'meter_type')) not in ('none', 'kilometres', 'hours', 'both') then
      row_errs := row_errs || jsonb_build_object('field', 'meter_type', 'code', 'invalid_meter_type', 'message', 'Use none, kilometres, hours or both');
    end if;
    if nullif(btrim(coalesce(r ->> 'asset_number', '')), '') is null then
      row_errs := row_errs || jsonb_build_object('field', 'asset_number', 'code', 'required', 'message', 'Asset number is required');
    elsif lower(btrim(r ->> 'asset_number')) = any (seen_numbers) then
      row_errs := row_errs || jsonb_build_object('field', 'asset_number', 'code', 'duplicate_in_file', 'message', 'This asset number appears earlier in the file');
    else
      seen_numbers := seen_numbers || lower(btrim(r ->> 'asset_number'));
    end if;

    if v_class is not null and jsonb_array_length(row_errs) = 0 then
      fields := jsonb_build_object(
        'asset_number', btrim(r ->> 'asset_number'),
        'asset_class_id', v_class,
        'make', nullif(btrim(coalesce(r ->> 'make', '')), ''),
        'model', nullif(btrim(coalesce(r ->> 'model', '')), ''),
        'year', nullif(btrim(coalesce(r ->> 'year', '')), ''),
        'registration_number', nullif(upper(btrim(coalesce(r ->> 'registration_number', ''))), ''),
        'registration_state', nullif(upper(btrim(coalesce(r ->> 'registration_state', ''))), ''),
        'vin', nullif(upper(btrim(coalesce(r ->> 'vin', ''))), ''),
        'serial_number', nullif(btrim(coalesce(r ->> 'serial_number', '')), ''),
        'owner_type', coalesce(nullif(lower(btrim(r ->> 'owner_type')), ''), 'own'),
        'client_id', v_client,
        'site_id', v_site,
        'meter_type', coalesce(nullif(lower(btrim(r ->> 'meter_type')), ''), v_meter::text),
        'notes', nullif(btrim(coalesce(r ->> 'notes', '')), ''),
        'duplicate_reason', nullif(btrim(coalesce(r ->> 'duplicate_reason', '')), ''),
        'odometer_km', nullif(btrim(coalesce(r ->> 'odometer_km', '')), ''),
        'engine_hours', nullif(btrim(coalesce(r ->> 'engine_hours', '')), '')
      );
      row_errs := row_errs || app.asset_validation_errors(p_organisation_id, null, fields);
      prepared := prepared || fields;
    end if;

    for e in select value from jsonb_array_elements(row_errs) loop
      errors := errors || (e || jsonb_build_object('row', i));
    end loop;
  end loop;

  if v_current + v_count > v_free and not exists (
    select 1 from public.fleet_subscription_consents where organisation_id = p_organisation_id and withdrawn_at is null
  ) then
    errors := errors || jsonb_build_object('row', null, 'field', null, 'code', 'fleet_consent_required',
      'message', format('This import would take the company above %s assets. The Owner or a Finance member must first agree to the fleet subscription.', v_free));
  end if;

  if p_dry_run or jsonb_array_length(errors) > 0 then
    return jsonb_build_object('dry_run', p_dry_run, 'row_count', v_count, 'valid', jsonb_array_length(errors) = 0,
                              'created', 0, 'errors', errors);
  end if;

  perform set_config('app.asset_create_reason', 'imported', true);
  for fields in select value from jsonb_array_elements(prepared) loop
    insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, year, registration_number,
      registration_state, vin, serial_number, owner_type, client_id, site_id, meter_type, notes, duplicate_reason)
    values (p_organisation_id, fields ->> 'asset_number', (fields ->> 'asset_class_id')::uuid, fields ->> 'make', fields ->> 'model',
      (fields ->> 'year')::smallint, fields ->> 'registration_number', fields ->> 'registration_state', fields ->> 'vin',
      fields ->> 'serial_number', (fields ->> 'owner_type')::public.asset_owner_type, (fields ->> 'client_id')::uuid,
      (fields ->> 'site_id')::uuid, (fields ->> 'meter_type')::public.meter_type, fields ->> 'notes', fields ->> 'duplicate_reason')
    returning id into v_asset;
    if fields ->> 'odometer_km' is not null then
      perform public.record_meter_reading(v_asset, 'km', (fields ->> 'odometer_km')::numeric, now(), 'import');
    end if;
    if fields ->> 'engine_hours' is not null then
      perform public.record_meter_reading(v_asset, 'hours', (fields ->> 'engine_hours')::numeric, now(), 'import');
    end if;
  end loop;
  perform set_config('app.asset_create_reason', '', true);
  perform app.audit('import', 'assets', null, p_organisation_id, jsonb_build_object('rows', v_count));

  return jsonb_build_object('dry_run', false, 'row_count', v_count, 'valid', true, 'created', v_count, 'errors', '[]'::jsonb);
end $$;
