-- =============================================================================
-- Defect triage and two-step clearance (2B; SoW §3.4, decisions #5, #6, D-07)
--
-- Decision O-09 (10 Nov 2026, Ahmad for HVEMS): the Owner and Fleet Managers
-- hold the clearance powers by role (Company Admins too, as the level above
-- Fleet Manager). The Clearance Authority grant still exists for others
-- (e.g. technicians).
--
-- * Triage: confirm or change severity. Raising is open to triage roles;
--   lowering needs defects.lower_severity and a reason, and lowering a Critical
--   also needs evidence (a photo).
-- * Dismiss (reason; Critical needs defects.dismiss_critical), merge into
--   another open defect on the same equipment, defer a Minor (reason, new due
--   date at most 30 days past the original).
-- * Mark repaired: Critical needs defects.clear_critical and moves the
--   equipment to "awaiting return to service" (it stays Out of service);
--   Minor/Advisory need defects.clear_non_critical.
-- * Return to service: a separate step (assets.return_to_service) once no other
--   Out-of-service cause is open.
-- Nothing here sets the condition directly (ADR-005): only causes change.
-- =============================================================================

alter type public.defect_status add value if not exists 'repaired';
alter type public.defect_status add value if not exists 'dismissed';
alter type public.defect_status add value if not exists 'merged';

alter table public.defects
  add column triaged_at timestamptz,
  add column triaged_by uuid references auth.users (id) on delete set null,
  add column due_date date,
  add column deferred_until date,
  add column deferral_reason text check (deferral_reason is null or char_length(deferral_reason) <= 1000),
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users (id) on delete set null,
  add column resolution_note text check (resolution_note is null or char_length(resolution_note) <= 4000),
  add column repaired_by uuid references auth.users (id) on delete set null,
  add column merged_into uuid,
  add column evidence_paths text[] not null default '{}',
  add constraint defects_merged_into_fk foreign key (merged_into, organisation_id) references public.defects (id, organisation_id);
create index defects_triaged_by_idx on public.defects (triaged_by);
create index defects_closed_by_idx on public.defects (closed_by);
create index defects_repaired_by_idx on public.defects (repaired_by);
create index defects_merged_into_org_idx on public.defects (merged_into, organisation_id);

-- Minor defects are due for repair after the configured period (D-07).
create or replace function app.defects_set_due() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.severity = 'minor' and new.due_date is null then
    new.due_date := ((new.reported_at at time zone 'Australia/Brisbane')::date
                     + coalesce(app.setting_int('defects.minor_repair_due_days'), 7));
  end if;
  return new;
end $$;
create trigger defects_set_due before insert or update of severity on public.defects
  for each row execute function app.defects_set_due();
update public.defects set due_date = ((reported_at at time zone 'Australia/Brisbane')::date + 7)
where severity = 'minor' and due_date is null;

-- Return-to-service records (append-only).
create table public.return_to_service_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  returned_by uuid not null references auth.users (id),
  returned_at timestamptz not null default now(),
  note text not null check (char_length(note) between 3 and 2000),
  evidence_paths text[] not null default '{}',
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index rts_events_asset_org_idx on public.return_to_service_events (asset_id, organisation_id);
create index rts_events_org_idx on public.return_to_service_events (organisation_id, returned_at desc);
create index rts_events_returned_by_idx on public.return_to_service_events (returned_by);
alter table public.return_to_service_events enable row level security;
create policy rts_events_read on public.return_to_service_events for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or asset_id = any ((select app.permitted_asset_ids())::uuid[])
);
create policy rts_events_read_super_admin on public.return_to_service_events for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
revoke all on public.return_to_service_events from anon, authenticated;
grant select on public.return_to_service_events to authenticated;
create trigger rts_events_immutable before update or delete on public.return_to_service_events
  for each row execute function app.prevent_audit_mutation();

-- BEGIN CAPABILITY SEED (matrix.ts mirror; the drift test reads every migration)
insert into app.role_capabilities (role, capability) values
  ('fleet_manager', 'defects.clear_critical'),
  ('fleet_manager', 'assets.return_to_service'),
  ('fleet_manager', 'defects.lower_severity'),
  ('fleet_manager', 'defects.dismiss_critical'),
  ('fleet_manager', 'defects.defer_minor'),
  ('fleet_manager', 'holds.remove_out_of_service'),
  ('administrator', 'defects.clear_critical'),
  ('administrator', 'assets.return_to_service'),
  ('administrator', 'defects.lower_severity'),
  ('administrator', 'defects.dismiss_critical'),
  ('administrator', 'defects.defer_minor'),
  ('administrator', 'holds.remove_out_of_service');
-- END CAPABILITY SEED

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.cause_kind_for(p_severity public.defect_severity)
returns public.condition_cause_kind language sql immutable set search_path = '' as $$
  select case p_severity when 'critical' then 'critical_defect'::public.condition_cause_kind
                         when 'minor' then 'minor_defect'::public.condition_cause_kind end
$$;

-- Lock an open defect for a workflow step and check the caller's base right.
create or replace function app.open_defect_for_update(p_defect_id uuid, p_capability text)
returns public.defects language plpgsql security definer set search_path = '' as $$
declare
  d public.defects%rowtype;
begin
  select * into d from public.defects where id = p_defect_id for update;
  if d.id is null then
    perform app.raise('not_found', 'Defect not found');
  end if;
  perform app.require_capability(d.organisation_id, p_capability);
  if d.status <> 'open' then
    perform app.raise('defect_not_open', 'This defect is already closed');
  end if;
  return d;
end $$;

-- Evidence paths must be in the company's photo folder for this equipment.
create or replace function app.check_evidence(p_org uuid, p_asset uuid, p_paths text[]) returns void
language plpgsql set search_path = '' as $$
declare
  p text;
begin
  foreach p in array coalesce(p_paths, '{}') loop
    if left(p, char_length(p_org::text || '/' || p_asset::text || '/')) <> p_org::text || '/' || p_asset::text || '/' or p like '%..%' then
      perform app.raise('invalid_evidence', 'A photo was not uploaded for this equipment');
    end if;
  end loop;
end $$;

-- Swap the condition cause when a defect's severity changes.
create or replace function app.reset_defect_cause(d public.defects, p_new public.defect_severity, p_resolution text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_cause uuid;
begin
  if d.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = d.cause_id and resolved_at is null) then
    -- Not 'cleared': a severity change is not a repair, so no return-to-service step is opened.
    perform app.resolve_condition_cause(d.cause_id, p_resolution);
  end if;
  if app.cause_kind_for(p_new) is not null then
    v_cause := app.open_condition_cause(d.asset_id, app.cause_kind_for(p_new), 'defect', d.id);
  end if;
  return v_cause;
end $$;

-- ---------------------------------------------------------------------------
-- Triage: confirm or change severity
-- ---------------------------------------------------------------------------
create or replace function public.triage_defect(
  p_defect_id uuid, p_severity public.defect_severity, p_reason text default null, p_evidence text[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.defects%rowtype;
  v_rank_from integer;
  v_rank_to integer;
begin
  d := app.open_defect_for_update(p_defect_id, 'defects.triage');
  v_rank_from := case d.severity when 'advisory' then 0 when 'minor' then 1 else 2 end;
  v_rank_to := case p_severity when 'advisory' then 0 when 'minor' then 1 else 2 end;
  if v_rank_to < v_rank_from then
    perform app.require_capability(d.organisation_id, 'defects.lower_severity');
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then
      perform app.raise('reason_required', 'Give a reason for lowering the severity');
    end if;
    if d.severity = 'critical' and coalesce(array_length(p_evidence, 1), 0) = 0 then
      perform app.raise('evidence_required', 'Lowering a Critical defect needs a photo as evidence');
    end if;
  end if;
  perform app.check_evidence(d.organisation_id, d.asset_id, p_evidence);

  if p_severity <> d.severity then
    update public.defects
    set severity = p_severity, cause_id = app.reset_defect_cause(d, p_severity, 'severity_changed'),
        due_date = case when p_severity = 'minor' then null else due_date end,
        triaged_at = now(), triaged_by = auth.uid(),
        evidence_paths = evidence_paths || coalesce(p_evidence, '{}')
    where id = d.id;
  else
    update public.defects set triaged_at = now(), triaged_by = auth.uid(), evidence_paths = evidence_paths || coalesce(p_evidence, '{}')
    where id = d.id;
  end if;
  perform app.audit('triage', 'defects', d.id, d.organisation_id,
    jsonb_build_object('from', d.severity, 'to', p_severity, 'reason', nullif(btrim(coalesce(p_reason, '')), ''), 'evidence', coalesce(array_length(p_evidence, 1), 0)));
end $$;

-- ---------------------------------------------------------------------------
-- Dismiss: not a real defect
-- ---------------------------------------------------------------------------
create or replace function public.dismiss_defect(p_defect_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.defects%rowtype;
begin
  d := app.open_defect_for_update(p_defect_id, 'defects.triage');
  if d.severity = 'critical' then
    perform app.require_capability(d.organisation_id, 'defects.dismiss_critical');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for dismissing the defect');
  end if;
  if d.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = d.cause_id and resolved_at is null) then
    perform app.resolve_condition_cause(d.cause_id, 'dismissed');
  end if;
  update public.defects
  set status = 'dismissed', closed_at = now(), closed_by = auth.uid(), resolution_note = btrim(p_reason),
      triaged_at = coalesce(triaged_at, now()), triaged_by = coalesce(triaged_by, auth.uid())
  where id = d.id;
  perform app.audit('dismiss', 'defects', d.id, d.organisation_id, jsonb_build_object('severity', d.severity, 'reason', btrim(p_reason)));
end $$;

-- ---------------------------------------------------------------------------
-- Merge a duplicate into another open defect on the same equipment
-- ---------------------------------------------------------------------------
create or replace function public.merge_defect(p_defect_id uuid, p_into_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.defects%rowtype;
  t public.defects%rowtype;
  v_rank_d integer;
  v_rank_t integer;
begin
  if p_defect_id = p_into_id then
    perform app.raise('invalid_merge', 'Choose a different defect to merge into');
  end if;
  d := app.open_defect_for_update(p_defect_id, 'defects.triage');
  t := app.open_defect_for_update(p_into_id, 'defects.triage');
  if t.asset_id <> d.asset_id then
    perform app.raise('invalid_merge', 'Only defects on the same equipment can be merged');
  end if;
  v_rank_d := case d.severity when 'advisory' then 0 when 'minor' then 1 else 2 end;
  v_rank_t := case t.severity when 'advisory' then 0 when 'minor' then 1 else 2 end;
  -- The kept defect takes the more serious severity, so merging never lowers safety.
  if v_rank_d > v_rank_t then
    update public.defects set severity = d.severity, cause_id = app.reset_defect_cause(t, d.severity, 'severity_changed') where id = t.id;
  end if;
  if d.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = d.cause_id and resolved_at is null) then
    perform app.resolve_condition_cause(d.cause_id, 'merged');
  end if;
  update public.defects
  set status = 'merged', merged_into = t.id, closed_at = now(), closed_by = auth.uid(),
      resolution_note = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Duplicate'),
      triaged_at = coalesce(triaged_at, now()), triaged_by = coalesce(triaged_by, auth.uid())
  where id = d.id;
  update public.defects set evidence_paths = evidence_paths || d.evidence_paths where id = t.id;
  perform app.audit('merge', 'defects', d.id, d.organisation_id, jsonb_build_object('into', t.id, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Defer a Minor defect (D-07)
-- ---------------------------------------------------------------------------
create or replace function public.defer_defect(p_defect_id uuid, p_new_due date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.defects%rowtype;
  v_limit date;
begin
  d := app.open_defect_for_update(p_defect_id, 'defects.triage');
  if d.severity = 'critical' then
    perform app.raise('critical_cannot_be_deferred', 'Critical defects cannot be deferred');
  end if;
  if d.severity <> 'minor' then
    perform app.raise('only_minor_deferred', 'Only Minor defects have a repair due date to defer');
  end if;
  perform app.require_capability(d.organisation_id, 'defects.defer_minor');
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for the deferral');
  end if;
  v_limit := d.due_date + coalesce(app.setting_int('defects.max_deferral_days'), 30);
  if p_new_due is null or p_new_due <= coalesce(d.deferred_until, d.due_date) or p_new_due > v_limit then
    perform app.raise('beyond_deferral_limit', format('Choose a new due date after the current one and no later than %s', to_char(v_limit, 'DD/MM/YYYY')));
  end if;
  update public.defects set deferred_until = p_new_due, deferral_reason = btrim(p_reason),
    triaged_at = coalesce(triaged_at, now()), triaged_by = coalesce(triaged_by, auth.uid())
  where id = d.id;
  perform app.audit('defer', 'defects', d.id, d.organisation_id, jsonb_build_object('from', coalesce(d.deferred_until, d.due_date), 'to', p_new_due, 'reason', btrim(p_reason)));
end $$;

-- ---------------------------------------------------------------------------
-- Mark repaired (step 1 of clearance for a Critical defect)
-- ---------------------------------------------------------------------------
create or replace function public.clear_defect(
  p_defect_id uuid, p_repair_details text, p_repaired_by uuid default null, p_evidence text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.defects%rowtype;
  v_repairer uuid := coalesce(p_repaired_by, auth.uid());
  v_rule boolean;
  v_awaiting boolean;
begin
  d := app.open_defect_for_update(p_defect_id, 'defects.triage');
  perform app.require_capability(d.organisation_id, case when d.severity = 'critical' then 'defects.clear_critical' else 'defects.clear_non_critical' end);
  if char_length(btrim(coalesce(p_repair_details, ''))) < 3 then
    perform app.raise('repair_details_required', 'Describe the repair');
  end if;
  if not exists (select 1 from public.org_memberships m where m.organisation_id = d.organisation_id and m.user_id = v_repairer) then
    perform app.raise('invalid_repairer', 'The repairer must be a member of this company');
  end if;
  select coalesce((settings ->> 'repairer_cannot_clear_own_critical')::boolean, false) into v_rule
  from public.organisations where id = d.organisation_id;
  if d.severity = 'critical' and v_rule and v_repairer = auth.uid() then
    perform app.raise('repairer_cannot_clear_own', 'Your company requires someone other than the repairer to clear a Critical repair');
  end if;
  perform app.check_evidence(d.organisation_id, d.asset_id, p_evidence);

  if d.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = d.cause_id and resolved_at is null) then
    -- 'cleared' on a Critical opens "awaiting return to service" first (app.resolve_condition_cause).
    perform app.resolve_condition_cause(d.cause_id, 'cleared');
  end if;
  update public.defects
  set status = 'repaired', closed_at = now(), closed_by = auth.uid(), repaired_by = v_repairer,
      resolution_note = btrim(p_repair_details), evidence_paths = evidence_paths || coalesce(p_evidence, '{}'),
      triaged_at = coalesce(triaged_at, now()), triaged_by = coalesce(triaged_by, auth.uid())
  where id = d.id;
  v_awaiting := exists (select 1 from public.asset_condition_causes
                        where asset_id = d.asset_id and kind = 'awaiting_return_to_service' and resolved_at is null);
  perform app.audit('clear', 'defects', d.id, d.organisation_id,
    jsonb_build_object('severity', d.severity, 'repaired_by', v_repairer, 'details', btrim(p_repair_details),
                       'evidence', coalesce(array_length(p_evidence, 1), 0)));
  return jsonb_build_object('awaiting_return_to_service', v_awaiting);
end $$;

-- ---------------------------------------------------------------------------
-- Return to service (step 2)
-- ---------------------------------------------------------------------------
create or replace function public.return_to_service(p_asset_id uuid, p_note text, p_evidence text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  c record;
  v_n integer := 0;
begin
  select * into a from public.assets where id = p_asset_id for update;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'assets.return_to_service');
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    perform app.raise('note_required', 'Say how you confirmed the equipment is fit to use');
  end if;
  if not app.can_return_to_service(a.id) then
    perform app.raise('open_out_of_service_causes', 'Clear the open Critical defects and holds first');
  end if;
  perform app.check_evidence(a.organisation_id, a.id, p_evidence);
  for c in select id from public.asset_condition_causes
           where asset_id = a.id and kind = 'awaiting_return_to_service' and resolved_at is null loop
    perform app.resolve_condition_cause(c.id, 'returned_to_service');
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    perform app.raise('not_awaiting_return', 'This equipment is not waiting to return to service');
  end if;
  insert into public.return_to_service_events (organisation_id, asset_id, returned_by, note, evidence_paths)
  values (a.organisation_id, a.id, auth.uid(), btrim(p_note), coalesce(p_evidence, '{}'));
  perform app.audit('return_to_service', 'assets', a.id, a.organisation_id, jsonb_build_object('note', btrim(p_note)));
end $$;

revoke execute on function
  public.triage_defect(uuid, public.defect_severity, text, text[]),
  public.dismiss_defect(uuid, text),
  public.merge_defect(uuid, uuid, text),
  public.defer_defect(uuid, date, text),
  public.clear_defect(uuid, text, uuid, text[]),
  public.return_to_service(uuid, text, text[])
from public, anon;
grant execute on function
  public.triage_defect(uuid, public.defect_severity, text, text[]),
  public.dismiss_defect(uuid, text),
  public.merge_defect(uuid, uuid, text),
  public.defer_defect(uuid, date, text),
  public.clear_defect(uuid, text, uuid, text[]),
  public.return_to_service(uuid, text, text[])
to authenticated;
revoke execute on function app.open_defect_for_update(uuid, text), app.reset_defect_cause(public.defects, public.defect_severity, text)
from public, anon, authenticated;
