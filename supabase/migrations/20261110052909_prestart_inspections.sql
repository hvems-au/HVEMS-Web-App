-- =============================================================================
-- Pre-start inspections (2B start, CS-11, CS-13 in part; P-01 draft content)
--
-- Content comes from docs/design/prestart-checklists-draft.md, with the SoW
-- severities: draft Critical -> critical (Out of service), draft Major ->
-- minor (Needs attention), draft Minor -> advisory (recorded only).
-- HVEMS will revise items later; templates carry a version, and every
-- submitted pre-start keeps its own copy of each question, so later changes
-- never alter past records.
--
-- * Standard templates (organisation_id null) apply by asset class code.
-- * "Operator" items (fit for work, licence) fail the pre-start but are not
--   asset defects: they never change the equipment's condition.
-- * A fault always needs a note; photos are recommended, never required.
-- * Faults raise defects; Critical and Minor defects open condition causes
--   (ADR-005: condition is derived). An open defect for the same item is not
--   duplicated.
-- * Critical and Minor faults notify the Owner and Fleet Managers (O-07).
-- =============================================================================

create type public.defect_severity as enum ('critical', 'minor', 'advisory');
create type public.defect_status as enum ('open', 'closed');
create type public.inspection_result as enum ('pass', 'pass_with_faults', 'fail');
create type public.inspection_answer as enum ('ok', 'fault', 'na');

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  code text not null check (code ~ '^[a-z_]+$'),
  name text not null,
  kind text not null default 'prestart' check (kind in ('prestart')),
  -- Applies to every class except those excluded, or only to the listed classes.
  applies_to_all boolean not null default false,
  asset_class_codes text[] not null default '{}',
  exclude_class_codes text[] not null default '{}',
  version integer not null default 1,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, code)
);

create table public.inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates (id) on delete cascade,
  code text not null,
  prompt text not null,
  severity public.defect_severity not null,
  na_allowed boolean not null default false,
  operator_item boolean not null default false,
  sort_order integer not null,
  active boolean not null default true,
  unique (template_id, code)
);
create index inspection_template_items_template_idx on public.inspection_template_items (template_id, sort_order);

-- ---------------------------------------------------------------------------
-- Submitted pre-starts (append-only records)
-- ---------------------------------------------------------------------------
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  kind text not null default 'prestart' check (kind in ('prestart')),
  result public.inspection_result not null,
  operator_fault boolean not null default false,
  submitted_by uuid not null references auth.users (id),
  submitted_at timestamptz not null default now(),
  odometer_km numeric(12, 1),
  engine_hours numeric(12, 1),
  notes text check (notes is null or char_length(notes) <= 4000),
  header jsonb not null,
  templates jsonb not null,
  client_request_id uuid,
  unique (id, organisation_id),
  unique (organisation_id, client_request_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index inspections_asset_idx on public.inspections (asset_id, submitted_at desc);
create index inspections_org_idx on public.inspections (organisation_id, submitted_at desc);
create index inspections_submitted_by_idx on public.inspections (submitted_by);

create table public.inspection_answers (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  inspection_id uuid not null,
  template_code text not null,
  template_name text not null,
  item_code text not null,
  prompt text not null,
  severity public.defect_severity not null,
  operator_item boolean not null,
  answer public.inspection_answer not null,
  note text check (note is null or char_length(note) <= 2000),
  sort_order integer not null,
  unique (inspection_id, item_code),
  foreign key (inspection_id, organisation_id) references public.inspections (id, organisation_id) on delete cascade
);
create index inspection_answers_org_idx on public.inspection_answers (organisation_id);

create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  inspection_id uuid not null,
  item_code text,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  foreign key (inspection_id, organisation_id) references public.inspections (id, organisation_id) on delete cascade
);
create index inspection_photos_inspection_idx on public.inspection_photos (inspection_id);
create index inspection_photos_org_idx on public.inspection_photos (organisation_id);

-- ---------------------------------------------------------------------------
-- Defects (triage, clearance and repair arrive with the rest of 2B)
-- ---------------------------------------------------------------------------
create table public.defects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  severity public.defect_severity not null,
  status public.defect_status not null default 'open',
  title text not null check (char_length(title) between 3 and 300),
  description text check (description is null or char_length(description) <= 4000),
  source text not null check (source in ('prestart')),
  inspection_id uuid,
  item_code text,
  cause_id uuid references public.asset_condition_causes (id),
  reported_by uuid references auth.users (id) on delete set null,
  reported_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id),
  foreign key (inspection_id, organisation_id) references public.inspections (id, organisation_id)
);
create index defects_asset_open_idx on public.defects (asset_id) where status = 'open';
create index defects_org_idx on public.defects (organisation_id, reported_at desc);
create index defects_inspection_idx on public.defects (inspection_id);
create index defects_cause_idx on public.defects (cause_id);
create index defects_reported_by_idx on public.defects (reported_by);

-- ---------------------------------------------------------------------------
-- In-app notifications (the outbox for email arrives with the email provider)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('critical_defect', 'minor_defect', 'operator_not_fit')),
  title text not null,
  body text,
  asset_id uuid,
  inspection_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_org_idx on public.notifications (organisation_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.inspection_templates enable row level security;
alter table public.inspection_template_items enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_answers enable row level security;
alter table public.inspection_photos enable row level security;
alter table public.defects enable row level security;
alter table public.notifications enable row level security;

create policy inspection_templates_read on public.inspection_templates for select to authenticated using (
  organisation_id is null or organisation_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
);
create policy inspection_template_items_read on public.inspection_template_items for select to authenticated using (
  exists (select 1 from public.inspection_templates t where t.id = template_id
          and (t.organisation_id is null or t.organisation_id = any ((select app.orgs_with_capability('org.view'))::uuid[])))
);

-- Managers see every pre-start of their company; a driver sees their own.
create policy inspections_read on public.inspections for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or submitted_by = (select auth.uid())
);
create policy inspections_read_super_admin on public.inspections for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy inspection_answers_read on public.inspection_answers for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or exists (select 1 from public.inspections i where i.id = inspection_id and i.submitted_by = (select auth.uid()))
);
create policy inspection_answers_read_super_admin on public.inspection_answers for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy inspection_photos_read on public.inspection_photos for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or exists (select 1 from public.inspections i where i.id = inspection_id and i.submitted_by = (select auth.uid()))
);

create policy defects_read on public.defects for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or (organisation_id = any ((select app.orgs_with_capability('assets.view_permitted'))::uuid[])
      and asset_id = any ((select app.permitted_asset_ids())::uuid[]))
);
create policy defects_read_super_admin on public.defects for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

create policy notifications_read_own on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

revoke all on public.inspection_templates, public.inspection_template_items, public.inspections,
  public.inspection_answers, public.inspection_photos, public.defects, public.notifications from anon, authenticated;
grant select on public.inspection_templates, public.inspection_template_items, public.inspections,
  public.inspection_answers, public.inspection_photos, public.defects, public.notifications to authenticated;

-- Submitted pre-starts and their answers never change (inspections: see app.inspections_guard below).
create trigger inspection_answers_immutable before update or delete on public.inspection_answers
  for each row execute function app.prevent_audit_mutation();

create trigger audit_defects after insert or update or delete on public.defects
  for each row execute function app.audit_row_change('organisation_id');

-- ---------------------------------------------------------------------------
-- The checklist for an asset: standard templates for its class (company
-- templates arrive with the template editor).
-- ---------------------------------------------------------------------------
create or replace function app.prestart_items(p_asset_id uuid)
returns table (
  template_code text, template_name text, template_version integer, template_sort integer,
  item_code text, prompt text, severity public.defect_severity, na_allowed boolean, operator_item boolean, item_sort integer
) language sql stable security definer set search_path = '' as $$
  select t.code, t.name, t.version, t.sort_order, i.code, i.prompt, i.severity, i.na_allowed, i.operator_item, i.sort_order
  from public.assets a
  join public.asset_classes c on c.id = a.asset_class_id
  join public.inspection_templates t on t.active and t.kind = 'prestart'
    and (t.organisation_id is null or t.organisation_id = a.organisation_id)
    and (
      (t.applies_to_all and not (coalesce(c.code, '') = any (t.exclude_class_codes)))
      or c.code = any (t.asset_class_codes)
    )
  join public.inspection_template_items i on i.template_id = t.id and i.active
  where a.id = p_asset_id
  order by t.sort_order, i.sort_order
$$;

-- Readable checklist for the pre-start form (same visibility as the asset).
create or replace function public.prestart_checklist(p_asset_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
begin
  select * into a from public.assets where id = p_asset_id;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'inspections.submit');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not permitted to operate this asset');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'template_code', p.template_code, 'template_name', p.template_name, 'template_version', p.template_version,
      'item_code', p.item_code, 'prompt', p.prompt, 'severity', p.severity,
      'na_allowed', p.na_allowed, 'operator_item', p.operator_item) order by p.template_sort, p.item_sort)
    from app.prestart_items(p_asset_id) p
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Submit a pre-start. p_answers: [{item_code, answer: ok|fault|na, note}]
-- p_photos: [{path, item_code?}] already uploaded to the inspection-photos
-- bucket under <organisation>/<asset>/<client_request_id>/.
-- ---------------------------------------------------------------------------
create or replace function public.submit_prestart(
  p_asset_id uuid,
  p_answers jsonb,
  p_odometer_km numeric default null,
  p_engine_hours numeric default null,
  p_notes text default null,
  p_photos jsonb default '[]'::jsonb,
  p_declaration boolean default false,
  p_client_request_id uuid default null,
  p_confirm_jump boolean default false,
  p_lower_reading_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  c public.asset_classes%rowtype;
  existing public.inspections%rowtype;
  it record;
  ans jsonb;
  v_answer public.inspection_answer;
  v_note text;
  errors jsonb := '[]'::jsonb;
  v_inspection uuid;
  v_result public.inspection_result := 'pass';
  v_operator_fault boolean := false;
  v_any_fault boolean := false;
  v_critical boolean := false;
  v_minor boolean := false;
  v_defect uuid;
  v_cause uuid;
  v_defects jsonb := '[]'::jsonb;
  v_header jsonb;
  v_templates jsonb;
  v_last_km public.meter_readings%rowtype;
  v_last_hours public.meter_readings%rowtype;
  v_photo jsonb;
  v_prefix text;
  v_driver_name text;
  r uuid;
  v_kind text;
  v_title text;
begin
  select * into a from public.assets where id = p_asset_id for update;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'inspections.submit');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not permitted to operate this asset');
  end if;
  if a.archived_at is not null then
    perform app.raise('asset_archived', 'Pre-starts cannot be done on archived equipment');
  end if;
  if not coalesce(p_declaration, false) then
    perform app.raise('declaration_required', 'Tick the declaration to submit the pre-start');
  end if;
  if jsonb_typeof(coalesce(p_answers, 'null'::jsonb)) <> 'array' then
    perform app.raise('invalid_answers', 'Answers must be a list');
  end if;

  -- Idempotent retries return the original pre-start.
  if p_client_request_id is not null then
    select * into existing from public.inspections
    where organisation_id = a.organisation_id and client_request_id = p_client_request_id;
    if existing.id is not null then
      return jsonb_build_object('inspection_id', existing.id, 'result', existing.result, 'duplicate', true);
    end if;
  end if;

  -- Every checklist item answered, faults explained, N/A only where allowed.
  for it in select * from app.prestart_items(a.id) loop
    select value into ans from jsonb_array_elements(p_answers) where value ->> 'item_code' = it.item_code limit 1;
    if ans is null or coalesce(ans ->> 'answer', '') not in ('ok', 'fault', 'na') then
      errors := errors || jsonb_build_object('item_code', it.item_code, 'code', 'answer_required', 'message', 'Answer this item');
    elsif ans ->> 'answer' = 'na' and not it.na_allowed then
      errors := errors || jsonb_build_object('item_code', it.item_code, 'code', 'na_not_allowed', 'message', 'N/A is not allowed for this item');
    elsif ans ->> 'answer' = 'fault' and char_length(btrim(coalesce(ans ->> 'note', ''))) < 3 then
      errors := errors || jsonb_build_object('item_code', it.item_code, 'code', 'note_required', 'message', 'Describe the fault');
    end if;
    ans := null;
  end loop;
  if not exists (select 1 from app.prestart_items(a.id)) then
    perform app.raise('no_checklist', 'There is no pre-start checklist for this type of equipment yet');
  end if;

  -- The meters the asset tracks must be read.
  if a.meter_type in ('kilometres', 'both') and p_odometer_km is null then
    errors := errors || jsonb_build_object('item_code', null, 'field', 'odometer_km', 'code', 'reading_required', 'message', 'Enter the odometer reading');
  end if;
  if a.meter_type in ('hours', 'both') and p_engine_hours is null then
    errors := errors || jsonb_build_object('item_code', null, 'field', 'engine_hours', 'code', 'reading_required', 'message', 'Enter the hour meter reading');
  end if;

  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > coalesce(app.setting_int('inspections.max_photos'), 10) then
    errors := errors || jsonb_build_object('item_code', null, 'field', 'photos', 'code', 'too_many_photos', 'message', 'Too many photos');
  end if;
  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 0 and p_client_request_id is null then
    perform app.raise('invalid_photos', 'Photos need a request id');
  end if;
  v_prefix := a.organisation_id::text || '/' || a.id::text || '/' || coalesce(p_client_request_id::text, '') || '/';
  for v_photo in select value from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) loop
    if left(coalesce(v_photo ->> 'path', ''), char_length(v_prefix)) <> v_prefix or (v_photo ->> 'path') like '%..%' then
      perform app.raise('invalid_photos', 'A photo was not uploaded for this pre-start');
    end if;
  end loop;

  if jsonb_array_length(errors) > 0 then
    perform app.raise('checklist_incomplete', 'Some items need your attention', jsonb_build_object('errors', errors));
  end if;

  -- The last accepted readings, shown on the record as they were before this pre-start.
  select * into v_last_km from public.meter_readings where asset_id = a.id and unit = 'km' and status = 'accepted'
    order by read_at desc, created_at desc limit 1;
  select * into v_last_hours from public.meter_readings where asset_id = a.id and unit = 'hours' and status = 'accepted'
    order by read_at desc, created_at desc limit 1;

  -- Meter readings, with the usual rules (lower readings need a reason; big jumps need confirmation).
  if p_odometer_km is not null then
    perform public.record_meter_reading(a.id, 'km', p_odometer_km, now(), 'inspection', null, p_lower_reading_reason, p_confirm_jump);
  end if;
  if p_engine_hours is not null then
    perform public.record_meter_reading(a.id, 'hours', p_engine_hours, now(), 'inspection', null, p_lower_reading_reason, p_confirm_jump);
  end if;

  select * into c from public.asset_classes where id = a.asset_class_id;
  select coalesce(nullif(full_name, ''), email) into v_driver_name from public.profiles where id = auth.uid();
  v_header := jsonb_build_object(
    'asset_number', a.asset_number, 'asset_class', c.name, 'make', a.make, 'model', a.model, 'year', a.year,
    'registration_number', a.registration_number, 'registration_state', a.registration_state,
    'vin', a.vin, 'serial_number', a.serial_number,
    'condition_before', a.condition, 'operator_name', v_driver_name,
    'last_odometer_km', v_last_km.value, 'last_odometer_at', v_last_km.read_at,
    'last_engine_hours', v_last_hours.value, 'last_engine_hours_at', v_last_hours.read_at
  );
  select jsonb_agg(distinct jsonb_build_object('code', p.template_code, 'name', p.template_name, 'version', p.template_version))
    into v_templates from app.prestart_items(a.id) p;

  insert into public.inspections (organisation_id, asset_id, result, submitted_by, odometer_km, engine_hours, notes, header, templates, client_request_id)
  values (a.organisation_id, a.id, 'pass', auth.uid(), p_odometer_km, p_engine_hours, nullif(btrim(coalesce(p_notes, '')), ''),
          v_header, coalesce(v_templates, '[]'::jsonb), p_client_request_id)
  returning id into v_inspection;
  -- The immutability trigger allows only this insert; the result is computed first below.

  for it in select * from app.prestart_items(a.id) loop
    select value into ans from jsonb_array_elements(p_answers) where value ->> 'item_code' = it.item_code limit 1;
    v_answer := (ans ->> 'answer')::public.inspection_answer;
    v_note := nullif(btrim(coalesce(ans ->> 'note', '')), '');
    insert into public.inspection_answers (organisation_id, inspection_id, template_code, template_name, item_code, prompt,
      severity, operator_item, answer, note, sort_order)
    values (a.organisation_id, v_inspection, it.template_code, it.template_name, it.item_code, it.prompt,
      it.severity, it.operator_item, v_answer, v_note, it.template_sort * 1000 + it.item_sort);

    if v_answer = 'fault' then
      v_any_fault := true;
      if it.operator_item then
        v_operator_fault := true;
      else
        if it.severity = 'critical' then v_critical := true; elsif it.severity = 'minor' then v_minor := true; end if;
        -- One open defect per item: a repeat report adds to the existing one.
        if not exists (select 1 from public.defects d where d.asset_id = a.id and d.item_code = it.item_code and d.status = 'open') then
          insert into public.defects (organisation_id, asset_id, severity, title, description, source, inspection_id, item_code, reported_by)
          values (a.organisation_id, a.id, it.severity, it.prompt, v_note, 'prestart', v_inspection, it.item_code, auth.uid())
          returning id into v_defect;
          if it.severity in ('critical', 'minor') then
            v_cause := app.open_condition_cause(a.id,
              (case it.severity when 'critical' then 'critical_defect' else 'minor_defect' end)::public.condition_cause_kind,
              'defect', v_defect);
            update public.defects set cause_id = v_cause where id = v_defect;
          end if;
          v_defects := v_defects || jsonb_build_object('id', v_defect, 'severity', it.severity, 'title', it.prompt);
        end if;
      end if;
    end if;
    ans := null;
  end loop;

  for v_photo in select value from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) loop
    insert into public.inspection_photos (organisation_id, inspection_id, item_code, storage_path)
    values (a.organisation_id, v_inspection, nullif(v_photo ->> 'item_code', ''), v_photo ->> 'path');
  end loop;

  v_result := case when v_critical or v_operator_fault then 'fail' when v_any_fault then 'pass_with_faults' else 'pass' end;
  -- inspections is append-only for API roles; this definer function records the computed result once.
  perform set_config('app.inspection_result_write', 'on', true);
  update public.inspections set result = v_result, operator_fault = v_operator_fault where id = v_inspection;
  perform set_config('app.inspection_result_write', '', true);

  -- Notify the Owner and Fleet Managers (O-07).
  if v_critical or v_minor or v_operator_fault then
    v_kind := case when v_critical then 'critical_defect' when v_operator_fault then 'operator_not_fit' else 'minor_defect' end;
    v_title := case v_kind
      when 'critical_defect' then format('%s is out of service: critical fault at pre-start', a.asset_number)
      when 'operator_not_fit' then format('Pre-start on %s failed: operator not fit or not licensed', a.asset_number)
      else format('%s needs attention: fault at pre-start', a.asset_number) end;
    for r in
      select m.user_id from public.org_memberships m
      where m.organisation_id = a.organisation_id and m.status = 'active' and m.role in ('owner', 'fleet_manager')
    loop
      insert into public.notifications (organisation_id, recipient_id, kind, title, body, asset_id, inspection_id)
      values (a.organisation_id, r, v_kind, v_title,
        format('Reported by %s. %s fault(s) recorded.', coalesce(v_driver_name, 'a driver'),
          (select count(*) from public.inspection_answers where inspection_id = v_inspection and answer = 'fault')),
        a.id, v_inspection);
    end loop;
  end if;

  perform app.audit('submit', 'inspections', v_inspection, a.organisation_id,
    jsonb_build_object('asset_id', a.id, 'result', v_result, 'defects', v_defects));

  return jsonb_build_object('inspection_id', v_inspection, 'result', v_result, 'operator_fault', v_operator_fault,
    'defects', v_defects, 'duplicate', false);
end $$;

-- The append-only trigger lets submit_prestart set the computed result once.
create or replace function app.inspections_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.inspection_result_write', true) = 'on'
     and new.id = old.id and new.asset_id = old.asset_id and new.submitted_by = old.submitted_by
     and new.submitted_at = old.submitted_at and new.header = old.header then
    return new;
  end if;
  raise exception 'Submitted pre-starts cannot be changed' using errcode = '42501';
end $$;
create trigger inspections_immutable before update or delete on public.inspections
  for each row execute function app.inspections_guard();

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.notifications set read_at = now()
  where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.prestart_checklist(uuid), public.submit_prestart(uuid, jsonb, numeric, numeric, text, jsonb, boolean, uuid, boolean, text),
  public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.prestart_checklist(uuid), public.submit_prestart(uuid, jsonb, numeric, numeric, text, jsonb, boolean, uuid, boolean, text),
  public.mark_notifications_read(uuid[]) to authenticated;
revoke execute on function app.prestart_items(uuid) from public, anon, authenticated;

insert into public.platform_settings (key, value, description, status)
values ('inspections.max_photos', '10', 'Most photos on one pre-start (draft P-01)', 'recommended')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Photo storage: private bucket; path <organisation>/<asset>/<request>/<file>.
-- Skipped where the storage schema doesn't exist (local test database).
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('inspection-photos', 'inspection-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do nothing;

    execute $p$
      create policy inspection_photos_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'inspection-photos'
        and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('inspections.submit'))::text[])
      )$p$;
    execute $p$
      create policy inspection_photos_view on storage.objects for select to authenticated using (
        bucket_id = 'inspection-photos'
        and ((storage.foldername(name))[1] = any ((select app.orgs_with_capability('assets.view'))::text[])
             or owner_id = (select auth.uid())::text)
      )$p$;
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- Standard pre-start content (draft P-01, 10 Nov 2026)
-- ---------------------------------------------------------------------------
insert into public.inspection_templates (code, name, applies_to_all, asset_class_codes, exclude_class_codes, sort_order) values
  ('safety', 'Safety', true, '{}', '{portable_fixed_equipment}', 10),
  ('generic', 'General condition', true, '{}', '{portable_fixed_equipment}', 20),
  ('excavator', 'Excavator', false, '{excavator}', '{}', 30),
  ('dozer', 'Dozer', false, '{dozer}', '{}', 30),
  ('loader', 'Loader', false, '{loader}', '{}', 30),
  ('grader', 'Grader', false, '{grader}', '{}', 30),
  ('truck', 'Truck and prime mover', false, '{prime_mover,rigid_truck,bus}', '{}', 30),
  ('trailer', 'Trailer', false, '{trailer}', '{}', 30),
  ('light_vehicle', 'Light vehicle', false, '{light_vehicle}', '{}', 30),
  ('portable', 'Portable or fixed equipment', false, '{portable_fixed_equipment}', '{}', 30);

insert into public.inspection_template_items (template_id, code, prompt, severity, na_allowed, operator_item, sort_order)
select t.id, v.code, v.prompt, v.severity::public.defect_severity, v.na, v.op, v.sort
from (values
  ('safety', 'S-01', 'I am fit for work: not fatigued, and not affected by alcohol, drugs or medication', 'critical', false, true, 1),
  ('safety', 'S-02', 'I hold the licence or competency for this machine', 'critical', false, true, 2),
  ('safety', 'S-03', 'Seatbelt is fitted, latches and retracts; not cut or frayed', 'critical', true, false, 3),
  ('safety', 'S-04', 'Cab protection (ROPS/FOPS) is undamaged: no cracks, bends or missing bolts', 'critical', true, false, 4),
  ('safety', 'S-05', 'Service brakes work', 'critical', false, false, 5),
  ('safety', 'S-06', 'Park brake holds', 'critical', false, false, 6),
  ('safety', 'S-07', 'Steering works normally, with no excessive free play', 'critical', false, false, 7),
  ('safety', 'S-08', 'Horn works', 'minor', false, false, 8),
  ('safety', 'S-09', 'Reversing or travel alarm works', 'critical', true, false, 9),
  ('safety', 'S-10', 'Flashing beacon works', 'minor', true, false, 10),
  ('safety', 'S-11', 'Emergency stop works', 'critical', true, false, 11),
  ('safety', 'S-12', 'Hydraulic isolation / lockout lever locks the controls', 'critical', true, false, 12),
  ('safety', 'S-13', 'Controls return to neutral; no unintended movement', 'critical', true, false, 13),
  ('safety', 'S-14', 'No warning lights or alarms after start-up; gauges read normal', 'minor', false, false, 14),
  ('safety', 'S-15', 'Mirrors and reversing camera are clean, adjusted and working', 'minor', true, false, 15),
  ('safety', 'S-16', 'Windscreen and windows are not cracked so as to block vision; wipers work', 'minor', true, false, 16),
  ('safety', 'S-17', 'Steps, handrails and grab handles are secure, clean and not slippery', 'minor', true, false, 17),
  ('safety', 'S-18', 'Fire extinguisher is present, in date and charged', 'minor', true, false, 18),
  ('safety', 'S-19', 'Fire suppression system is armed and in date', 'minor', true, false, 19),
  ('safety', 'S-20', 'Emergency exit is clear and works', 'minor', true, false, 20),
  ('safety', 'S-21', 'No fluid leaks that create a fire or slip risk', 'critical', false, false, 21),

  ('generic', 'G-01', 'Walk-around: no new damage to body, panels, guards or attachments', 'advisory', false, false, 1),
  ('generic', 'G-02', 'Guards and covers are fitted and secure', 'minor', true, false, 2),
  ('generic', 'G-03', 'Engine oil level OK', 'minor', true, false, 3),
  ('generic', 'G-04', 'Coolant level OK', 'minor', true, false, 4),
  ('generic', 'G-05', 'Hydraulic oil level OK', 'minor', true, false, 5),
  ('generic', 'G-06', 'Fuel level enough for the shift', 'advisory', true, false, 6),
  ('generic', 'G-07', 'AdBlue/DEF level OK', 'advisory', true, false, 7),
  ('generic', 'G-08', 'No small leaks: oil, coolant, fuel or hydraulic', 'advisory', false, false, 8),
  ('generic', 'G-09', 'Hoses and fittings: no rubbing, cracks or bulges', 'minor', true, false, 9),
  ('generic', 'G-10', 'Belts and fan: no visible damage', 'minor', true, false, 10),
  ('generic', 'G-11', 'Air filter restriction indicator OK', 'advisory', true, false, 11),
  ('generic', 'G-12', 'Battery secure; isolator works', 'minor', true, false, 12),
  ('generic', 'G-13', 'Lights work: head, tail, work and indicator lights', 'minor', true, false, 13),
  ('generic', 'G-14', 'Cab clean; no loose items that could jam controls', 'advisory', true, false, 14),
  ('generic', 'G-15', 'Seat secure and adjusts', 'advisory', true, false, 15),
  ('generic', 'G-16', 'Air conditioning / demister works', 'advisory', true, false, 16),
  ('generic', 'G-17', 'First aid kit present', 'advisory', true, false, 17),
  ('generic', 'G-18', 'Operator''s manual and any load chart in the cab', 'advisory', true, false, 18),
  ('generic', 'G-19', 'Grease points greased as the manual requires', 'advisory', true, false, 19),
  ('generic', 'G-20', 'Clean enough to inspect: mud and debris not hiding damage', 'advisory', false, false, 20),

  ('excavator', 'EX-01', 'Quick hitch: safety pin or latch engaged; bucket test-pulled against the ground before work', 'critical', true, false, 1),
  ('excavator', 'EX-02', 'Quick hitch warning light or alarm works', 'critical', true, false, 2),
  ('excavator', 'EX-03', 'Boom, stick and bucket pins and keepers in place', 'critical', false, false, 3),
  ('excavator', 'EX-04', 'Boom and stick: no cracks in welds or structure', 'critical', false, false, 4),
  ('excavator', 'EX-05', 'Hydraulic rams: no leaks; rods not scored', 'minor', false, false, 5),
  ('excavator', 'EX-06', 'Bucket teeth and side cutters secure', 'advisory', true, false, 6),
  ('excavator', 'EX-07', 'Tracks: tension OK; no broken pads; rollers and idlers OK', 'minor', true, false, 7),
  ('excavator', 'EX-08', 'Slew lock and slew brake work', 'minor', false, false, 8),
  ('excavator', 'EX-09', 'Counterweight secure', 'critical', false, false, 9),
  ('excavator', 'EX-10', 'Hose burst / load-holding valves fitted if used for lifting', 'critical', true, false, 10),
  ('excavator', 'EX-11', 'Rated capacity chart in the cab if used for lifting', 'minor', true, false, 11),

  ('dozer', 'DZ-01', 'Blade, push arms and tilt rams: no cracks; pins secure', 'critical', false, false, 1),
  ('dozer', 'DZ-02', 'Cutting edges and end bits secure', 'advisory', false, false, 2),
  ('dozer', 'DZ-03', 'Ripper shank, tip and pin secure', 'minor', true, false, 3),
  ('dozer', 'DZ-04', 'Tracks: tension OK; no broken shoes; undercarriage OK', 'minor', false, false, 4),
  ('dozer', 'DZ-05', 'Final drives: no leaks', 'minor', false, false, 5),
  ('dozer', 'DZ-06', 'Winch rope and controls OK', 'critical', true, false, 6),

  ('loader', 'LD-01', 'Articulation lock pin is stowed for operation', 'critical', true, false, 1),
  ('loader', 'LD-02', 'Bucket or forks secure; coupler pin engaged', 'critical', false, false, 2),
  ('loader', 'LD-03', 'Lift arms and linkages: no cracks; pins secure', 'critical', false, false, 3),
  ('loader', 'LD-04', 'Tyres: no cuts or bulges; pressure looks right; wheel nuts tight', 'minor', true, false, 4),
  ('loader', 'LD-05', 'Skid steer: seat bar and lap bar interlock works', 'critical', true, false, 5),
  ('loader', 'LD-06', 'Backhoe: stabilisers and boom lock work', 'minor', true, false, 6),

  ('grader', 'GR-01', 'Blade, circle and moldboard secure; no cracks', 'minor', false, false, 1),
  ('grader', 'GR-02', 'Articulation and front wheel lean work', 'minor', false, false, 2),
  ('grader', 'GR-03', 'Scarifier / ripper secure', 'minor', true, false, 3),
  ('grader', 'GR-04', 'Tyres and wheel nuts OK', 'minor', false, false, 4),
  ('grader', 'GR-05', 'Tandem drives: no leaks', 'advisory', false, false, 5),

  ('truck', 'TR-01', 'Wheels and tyres: tread OK, no damage; wheel nuts tight with no rust trails', 'critical', false, false, 1),
  ('truck', 'TR-02', 'Air system builds pressure; no audible leaks; low-air warning works', 'critical', true, false, 2),
  ('truck', 'TR-03', 'Brake test done before moving', 'critical', false, false, 3),
  ('truck', 'TR-04', 'Coupling: fifth wheel or tow coupling locked; safety chains fitted', 'critical', true, false, 4),
  ('truck', 'TR-05', 'Lights and reflectors work, including trailer lights', 'minor', false, false, 5),
  ('truck', 'TR-06', 'Load restraint: load secure; restraint equipment in date', 'critical', true, false, 6),
  ('truck', 'TR-07', 'Mudflaps and guards present', 'advisory', true, false, 7),
  ('truck', 'TR-08', 'Registration current', 'minor', false, false, 8),
  ('truck', 'TR-09', 'Work diary present if required', 'minor', true, false, 9),

  ('trailer', 'TL-01', 'Coupling, kingpin or drawbar: no cracks; locked', 'critical', false, false, 1),
  ('trailer', 'TL-02', 'Brakes connected and working; breakaway system OK', 'critical', false, false, 2),
  ('trailer', 'TL-03', 'Wheels, tyres and wheel nuts OK', 'critical', false, false, 3),
  ('trailer', 'TL-04', 'Lights and reflectors work', 'minor', false, false, 4),
  ('trailer', 'TL-05', 'Ramps and pins secure for travel', 'critical', true, false, 5),
  ('trailer', 'TL-06', 'Landing legs raised and secure', 'minor', true, false, 6),

  ('light_vehicle', 'LV-01', 'Tyres (including spare) and wheel nuts OK', 'minor', false, false, 1),
  ('light_vehicle', 'LV-02', 'Brakes, steering and lights work', 'critical', false, false, 2),
  ('light_vehicle', 'LV-03', 'Site items present (flag, beacon, UHF radio)', 'minor', true, false, 3),
  ('light_vehicle', 'LV-04', 'Registration current', 'minor', false, false, 4),

  ('portable', 'PT-01', 'I am competent to use this equipment', 'critical', false, true, 1),
  ('portable', 'PT-02', 'Guards fitted and secure', 'critical', true, false, 2),
  ('portable', 'PT-03', 'Emergency stop / isolation works', 'critical', true, false, 3),
  ('portable', 'PT-04', 'Leads, plugs and hoses undamaged; electrical test tag in date', 'critical', true, false, 4),
  ('portable', 'PT-05', 'No fuel, oil or hydraulic leaks', 'minor', true, false, 5),
  ('portable', 'PT-06', 'Fire extinguisher nearby', 'advisory', true, false, 6),
  ('portable', 'PT-07', 'Walk-around: no new damage', 'advisory', false, false, 7)
) as v(template, code, prompt, severity, na, op, sort)
join public.inspection_templates t on t.code = v.template and t.organisation_id is null;
