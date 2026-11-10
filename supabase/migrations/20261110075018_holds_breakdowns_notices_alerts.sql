-- =============================================================================
-- 2B safety: holds, breakdowns, regulator defect notices, critical alerts with
-- acknowledgement and escalation (SoW §3.4, CS-13, CS-15, CS-16, CS-40).
--
-- * Holds: a manager takes equipment Out of service or marks it Needs
--   attention by hand, with a reason. Removing an Out-of-service hold needs
--   holds.remove_out_of_service and leads to "awaiting return to service"
--   (two-step clearance, as for Critical defects).
-- * Breakdowns: anyone who reports defects can log one; it takes the
--   equipment Out of service until resolved and returned to service.
-- * Regulator defect notices (e.g. NHVR / TMR / police): Major notices take the
--   equipment Out of service; Minor and self-clearing notices make it Needs
--   attention. Clearing needs a clearance reference.
-- * Critical alerts: one alert per Out-of-service event (critical pre-start
--   fault, Out-of-service hold, breakdown, Major notice), sent to the Owner and
--   Fleet Managers (O-07). Anyone receiving it acknowledges it for everyone.
--   Unacknowledged: escalated after 30 minutes (adds Company Admins) and again
--   after 2 hours (everyone again, marked urgent). pg_cron runs the check
--   every 5 minutes where available.
-- Condition stays derived (ADR-005): everything here opens or resolves causes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings (HVEMS can change these without development)
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('alerts.escalate_first_minutes', '30', 'Minutes before an unacknowledged critical alert is escalated the first time', 'confirmed', '§3.4'),
  ('alerts.escalate_second_minutes', '120', 'Minutes before an unacknowledged critical alert is escalated the second time', 'confirmed', '§3.4')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Critical alerts
-- ---------------------------------------------------------------------------
create table public.critical_alerts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null,
  kind text not null check (kind in ('critical_defect', 'out_of_service_hold', 'breakdown', 'regulator_notice')),
  title text not null,
  source_type text not null,
  source_id uuid,
  raised_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  escalation_level smallint not null default 0 check (escalation_level between 0 and 2),
  last_escalated_at timestamptz,
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create index critical_alerts_open_idx on public.critical_alerts (raised_at) where acknowledged_at is null;
create index critical_alerts_org_idx on public.critical_alerts (organisation_id, raised_at desc);
create index critical_alerts_asset_org_idx on public.critical_alerts (asset_id, organisation_id);
create index critical_alerts_ack_by_idx on public.critical_alerts (acknowledged_by);
create unique index critical_alerts_one_per_source on public.critical_alerts (source_type, source_id) where source_id is not null;

alter table public.critical_alerts enable row level security;
-- Members who receive alerts (Owner, Admins, Fleet Managers) see their company's alerts.
create policy critical_alerts_read on public.critical_alerts for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('defects.triage'))::uuid[])
);
revoke all on public.critical_alerts from anon, authenticated;
grant select on public.critical_alerts to authenticated;

alter table public.notifications add column alert_id uuid;
alter table public.notifications add constraint notifications_alert_fk foreign key (alert_id) references public.critical_alerts (id) on delete cascade;
create index notifications_alert_idx on public.notifications (alert_id);
-- New notification kinds: the check constraint is replaced with a wider list.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated'));

-- Recipients: Owner and Fleet Managers (O-07); escalation adds Company Admins.
create or replace function app.alert_recipients(p_org uuid, p_include_admins boolean)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.org_memberships m
  where m.organisation_id = p_org and m.status = 'active'
    and (m.role in ('owner', 'fleet_manager') or (p_include_admins and m.role = 'administrator'))
$$;

-- Notify a set of people (in-app; email joins the outbox when the provider is set up).
create or replace function app.notify(p_org uuid, p_kind text, p_title text, p_body text, p_asset uuid,
  p_include_admins boolean default false, p_alert uuid default null, p_inspection uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, asset_id, inspection_id, alert_id)
  select p_org, r, p_kind, p_title, p_body, p_asset, p_inspection, p_alert
  from app.alert_recipients(p_org, p_include_admins) r;
end $$;

-- Raise (or reuse) the critical alert for one Out-of-service event.
create or replace function app.raise_critical_alert(p_org uuid, p_asset uuid, p_kind text, p_title text, p_body text,
  p_source_type text, p_source_id uuid, p_inspection uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.critical_alerts where source_type = p_source_type and source_id = p_source_id;
  if v_id is null then
    insert into public.critical_alerts (organisation_id, asset_id, kind, title, source_type, source_id)
    values (p_org, p_asset, p_kind, p_title, p_source_type, p_source_id)
    returning id into v_id;
    perform app.notify(p_org, p_kind, p_title, p_body, p_asset, false, v_id, p_inspection);
  end if;
  return v_id;
end $$;

-- Critical pre-start notifications (written by submit_prestart) join an alert
-- for that pre-start, so they can be acknowledged and escalated.
create or replace function app.notifications_link_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  if new.kind = 'critical_defect' and new.alert_id is null and new.inspection_id is not null then
    select id into new.alert_id from public.critical_alerts where source_type = 'inspection' and source_id = new.inspection_id;
    if new.alert_id is null then
      insert into public.critical_alerts (organisation_id, asset_id, kind, title, source_type, source_id)
      values (new.organisation_id, new.asset_id, 'critical_defect', new.title, 'inspection', new.inspection_id)
      returning id into new.alert_id;
    end if;
  end if;
  return new;
end $$;
create trigger notifications_link_alert before insert on public.notifications
  for each row execute function app.notifications_link_alert();

create or replace function public.acknowledge_alert(p_alert_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.critical_alerts%rowtype;
begin
  select * into a from public.critical_alerts where id = p_alert_id for update;
  if a.id is null then
    perform app.raise('not_found', 'Alert not found');
  end if;
  perform app.require_capability(a.organisation_id, 'defects.triage');
  if a.acknowledged_at is null then
    update public.critical_alerts set acknowledged_at = now(), acknowledged_by = auth.uid() where id = a.id;
    update public.notifications set read_at = coalesce(read_at, now()) where alert_id = a.id and recipient_id = auth.uid();
    perform app.audit('acknowledge', 'critical_alerts', a.id, a.organisation_id, jsonb_build_object('title', a.title));
  end if;
end $$;

-- Escalate unacknowledged alerts (run by pg_cron every 5 minutes; safe to repeat).
create or replace function app.escalate_alerts(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_first integer := coalesce(app.setting_int('alerts.escalate_first_minutes'), 30);
  v_second integer := coalesce(app.setting_int('alerts.escalate_second_minutes'), 120);
  v_n integer := 0;
begin
  for a in
    select * from public.critical_alerts
    where acknowledged_at is null
      and ((escalation_level = 0 and raised_at <= p_now - make_interval(mins => v_first))
        or (escalation_level = 1 and raised_at <= p_now - make_interval(mins => v_second)))
    for update skip locked
  loop
    update public.critical_alerts set escalation_level = escalation_level + 1, last_escalated_at = p_now where id = a.id;
    perform app.notify(a.organisation_id, 'alert_escalated',
      case when a.escalation_level = 0 then format('Not yet acknowledged (%s min): %s', v_first, a.title)
           else format('URGENT, %s hours without acknowledgement: %s', round(v_second / 60.0, 1), a.title) end,
      'Open Alerts and acknowledge it so everyone knows it is being handled.',
      a.asset_id, true, a.id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Holds
-- ---------------------------------------------------------------------------
create table public.holds (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  kind text not null check (kind in ('out_of_service', 'needs_attention')),
  reason text not null check (char_length(reason) between 3 and 2000),
  placed_by uuid references auth.users (id) on delete set null,
  placed_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  removal_note text check (removal_note is null or char_length(removal_note) <= 2000),
  cause_id uuid references public.asset_condition_causes (id),
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index holds_asset_org_idx on public.holds (asset_id, organisation_id);
create index holds_open_idx on public.holds (organisation_id) where removed_at is null;
create index holds_placed_by_idx on public.holds (placed_by);
create index holds_removed_by_idx on public.holds (removed_by);
create index holds_cause_idx on public.holds (cause_id);

-- ---------------------------------------------------------------------------
-- Breakdowns
-- ---------------------------------------------------------------------------
create table public.breakdowns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  description text not null check (char_length(description) between 3 and 2000),
  location text check (location is null or char_length(location) <= 300),
  reported_by uuid references auth.users (id) on delete set null,
  reported_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  evidence_paths text[] not null default '{}',
  cause_id uuid references public.asset_condition_causes (id),
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index breakdowns_asset_org_idx on public.breakdowns (asset_id, organisation_id);
create index breakdowns_open_idx on public.breakdowns (organisation_id) where status = 'open';
create index breakdowns_reported_by_idx on public.breakdowns (reported_by);
create index breakdowns_resolved_by_idx on public.breakdowns (resolved_by);
create index breakdowns_cause_idx on public.breakdowns (cause_id);

-- ---------------------------------------------------------------------------
-- Regulator defect notices
-- ---------------------------------------------------------------------------
create table public.regulator_notices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  authority text not null check (char_length(authority) between 2 and 120),
  notice_number text check (notice_number is null or char_length(notice_number) <= 60),
  severity text not null check (severity in ('major', 'minor', 'self_clearing')),
  issued_on date not null,
  clear_by date,
  details text not null check (char_length(details) between 3 and 2000),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'cleared')),
  cleared_on date,
  clearance_reference text check (clearance_reference is null or char_length(clearance_reference) <= 300),
  cleared_by uuid references auth.users (id) on delete set null,
  evidence_paths text[] not null default '{}',
  cause_id uuid references public.asset_condition_causes (id),
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index notices_asset_org_idx on public.regulator_notices (asset_id, organisation_id);
create index notices_open_idx on public.regulator_notices (organisation_id) where status = 'open';
create index notices_recorded_by_idx on public.regulator_notices (recorded_by);
create index notices_cleared_by_idx on public.regulator_notices (cleared_by);
create index notices_cause_idx on public.regulator_notices (cause_id);

-- Read access: like the equipment itself; Super Admin read-only (O-05).
alter table public.holds enable row level security;
alter table public.breakdowns enable row level security;
alter table public.regulator_notices enable row level security;
create policy holds_read on public.holds for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[]) or asset_id = any ((select app.permitted_asset_ids())::uuid[]));
create policy breakdowns_read on public.breakdowns for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[]) or asset_id = any ((select app.permitted_asset_ids())::uuid[]));
create policy notices_read on public.regulator_notices for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[]) or asset_id = any ((select app.permitted_asset_ids())::uuid[]));
create policy holds_read_super_admin on public.holds for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy breakdowns_read_super_admin on public.breakdowns for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy notices_read_super_admin on public.regulator_notices for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
revoke all on public.holds, public.breakdowns, public.regulator_notices from anon, authenticated;
grant select on public.holds, public.breakdowns, public.regulator_notices to authenticated;

create trigger audit_holds after insert or update or delete on public.holds
  for each row execute function app.audit_row_change('organisation_id');
create trigger audit_breakdowns after insert or update or delete on public.breakdowns
  for each row execute function app.audit_row_change('organisation_id');
create trigger audit_regulator_notices after insert or update or delete on public.regulator_notices
  for each row execute function app.audit_row_change('organisation_id');

-- Lock the asset for a safety step; archived equipment takes no new events.
create or replace function app.asset_for_safety(p_asset_id uuid) returns public.assets
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
begin
  select * into a from public.assets where id = p_asset_id for update;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  if a.archived_at is not null then
    perform app.raise('asset_archived', 'This equipment is archived');
  end if;
  return a;
end $$;

-- ---------------------------------------------------------------------------
-- Holds: place and remove
-- ---------------------------------------------------------------------------
create or replace function public.place_hold(p_asset_id uuid, p_kind text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  v_id uuid;
  v_cause uuid;
begin
  a := app.asset_for_safety(p_asset_id);
  perform app.require_capability(a.organisation_id, 'holds.place');
  if p_kind not in ('out_of_service', 'needs_attention') then
    perform app.raise('invalid_hold', 'Choose Out of service or Needs attention');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for the hold');
  end if;
  insert into public.holds (organisation_id, asset_id, kind, reason, placed_by)
  values (a.organisation_id, a.id, p_kind, btrim(p_reason), auth.uid()) returning id into v_id;
  v_cause := app.open_condition_cause(a.id,
    (case p_kind when 'out_of_service' then 'out_of_service_hold' else 'needs_attention_hold' end)::public.condition_cause_kind, 'hold', v_id);
  update public.holds set cause_id = v_cause where id = v_id;
  if p_kind = 'out_of_service' then
    perform app.raise_critical_alert(a.organisation_id, a.id, 'out_of_service_hold',
      format('%s placed on an Out-of-service hold', a.asset_number), btrim(p_reason), 'hold', v_id);
  end if;
  return v_id;
end $$;

create or replace function public.remove_hold(p_hold_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h public.holds%rowtype;
begin
  select * into h from public.holds where id = p_hold_id for update;
  if h.id is null then
    perform app.raise('not_found', 'Hold not found');
  end if;
  perform app.require_capability(h.organisation_id, case when h.kind = 'out_of_service' then 'holds.remove_out_of_service' else 'holds.place' end);
  if h.removed_at is not null then
    perform app.raise('hold_not_open', 'This hold has already been removed');
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    perform app.raise('note_required', 'Say why the hold can be removed');
  end if;
  if h.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = h.cause_id and resolved_at is null) then
    -- 'cleared' on an Out-of-service hold opens "awaiting return to service" (two steps).
    perform app.resolve_condition_cause(h.cause_id, 'cleared');
  end if;
  update public.holds set removed_at = now(), removed_by = auth.uid(), removal_note = btrim(p_note) where id = h.id;
  return jsonb_build_object('awaiting_return_to_service', h.kind = 'out_of_service');
end $$;

-- ---------------------------------------------------------------------------
-- Breakdowns: report and resolve
-- ---------------------------------------------------------------------------
create or replace function public.report_breakdown(p_asset_id uuid, p_description text, p_location text default null, p_evidence text[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  v_id uuid;
  v_cause uuid;
begin
  a := app.asset_for_safety(p_asset_id);
  perform app.require_capability(a.organisation_id, 'defects.report');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not permitted to operate this asset');
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 3 then
    perform app.raise('description_required', 'Describe the breakdown');
  end if;
  perform app.check_evidence(a.organisation_id, a.id, p_evidence);
  insert into public.breakdowns (organisation_id, asset_id, description, location, reported_by, evidence_paths)
  values (a.organisation_id, a.id, btrim(p_description), nullif(btrim(coalesce(p_location, '')), ''), auth.uid(), coalesce(p_evidence, '{}'))
  returning id into v_id;
  v_cause := app.open_condition_cause(a.id, 'out_of_service_hold', 'breakdown', v_id);
  update public.breakdowns set cause_id = v_cause where id = v_id;
  perform app.raise_critical_alert(a.organisation_id, a.id, 'breakdown',
    format('%s has broken down', a.asset_number),
    concat_ws(' · ', btrim(p_description), nullif(btrim(coalesce(p_location, '')), '')), 'breakdown', v_id);
  return v_id;
end $$;

create or replace function public.resolve_breakdown(p_breakdown_id uuid, p_resolution text, p_evidence text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.breakdowns%rowtype;
begin
  select * into b from public.breakdowns where id = p_breakdown_id for update;
  if b.id is null then
    perform app.raise('not_found', 'Breakdown not found');
  end if;
  perform app.require_capability(b.organisation_id, 'holds.remove_out_of_service');
  if b.status <> 'open' then
    perform app.raise('breakdown_not_open', 'This breakdown is already resolved');
  end if;
  if char_length(btrim(coalesce(p_resolution, ''))) < 3 then
    perform app.raise('resolution_required', 'Describe how the breakdown was fixed');
  end if;
  perform app.check_evidence(b.organisation_id, b.asset_id, p_evidence);
  if b.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = b.cause_id and resolved_at is null) then
    perform app.resolve_condition_cause(b.cause_id, 'cleared');
  end if;
  update public.breakdowns set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution = btrim(p_resolution),
    evidence_paths = evidence_paths || coalesce(p_evidence, '{}') where id = b.id;
end $$;

-- ---------------------------------------------------------------------------
-- Regulator defect notices: record and clear
-- ---------------------------------------------------------------------------
create or replace function public.record_regulator_notice(
  p_asset_id uuid, p_authority text, p_severity text, p_issued_on date, p_details text,
  p_notice_number text default null, p_clear_by date default null, p_evidence text[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  v_id uuid;
  v_cause uuid;
begin
  a := app.asset_for_safety(p_asset_id);
  perform app.require_capability(a.organisation_id, 'holds.place');
  if p_severity not in ('major', 'minor', 'self_clearing') then
    perform app.raise('invalid_notice', 'Choose Major, Minor or Self-clearing');
  end if;
  if char_length(btrim(coalesce(p_authority, ''))) < 2 or char_length(btrim(coalesce(p_details, ''))) < 3 or p_issued_on is null then
    perform app.raise('notice_details_required', 'Enter the authority, the date issued and the defects listed');
  end if;
  if p_clear_by is not null and p_clear_by < p_issued_on then
    perform app.raise('invalid_clear_by', 'The clear-by date cannot be before the date issued');
  end if;
  perform app.check_evidence(a.organisation_id, a.id, p_evidence);
  insert into public.regulator_notices (organisation_id, asset_id, authority, notice_number, severity, issued_on, clear_by, details, recorded_by, evidence_paths)
  values (a.organisation_id, a.id, btrim(p_authority), nullif(btrim(coalesce(p_notice_number, '')), ''), p_severity, p_issued_on, p_clear_by,
          btrim(p_details), auth.uid(), coalesce(p_evidence, '{}'))
  returning id into v_id;
  v_cause := app.open_condition_cause(a.id,
    (case p_severity when 'major' then 'out_of_service_hold' else 'needs_attention_hold' end)::public.condition_cause_kind, 'regulator_notice', v_id);
  update public.regulator_notices set cause_id = v_cause where id = v_id;
  if p_severity = 'major' then
    perform app.raise_critical_alert(a.organisation_id, a.id, 'regulator_notice',
      format('%s has a Major defect notice from %s', a.asset_number, btrim(p_authority)), btrim(p_details), 'regulator_notice', v_id);
  else
    perform app.notify(a.organisation_id, 'regulator_notice',
      format('%s has a %s defect notice from %s', a.asset_number, replace(p_severity, '_', '-'), btrim(p_authority)), btrim(p_details), a.id);
  end if;
  return v_id;
end $$;

create or replace function public.clear_regulator_notice(p_notice_id uuid, p_cleared_on date, p_reference text, p_evidence text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  n public.regulator_notices%rowtype;
begin
  select * into n from public.regulator_notices where id = p_notice_id for update;
  if n.id is null then
    perform app.raise('not_found', 'Notice not found');
  end if;
  perform app.require_capability(n.organisation_id, case when n.severity = 'major' then 'holds.remove_out_of_service' else 'holds.place' end);
  if n.status <> 'open' then
    perform app.raise('notice_not_open', 'This notice is already cleared');
  end if;
  if char_length(btrim(coalesce(p_reference, ''))) < 3 or p_cleared_on is null then
    perform app.raise('clearance_reference_required', 'Enter the clearance date and reference (e.g. inspection station and certificate number)');
  end if;
  perform app.check_evidence(n.organisation_id, n.asset_id, p_evidence);
  if n.cause_id is not null and exists (select 1 from public.asset_condition_causes where id = n.cause_id and resolved_at is null) then
    perform app.resolve_condition_cause(n.cause_id, 'cleared');
  end if;
  update public.regulator_notices set status = 'cleared', cleared_on = p_cleared_on, clearance_reference = btrim(p_reference),
    cleared_by = auth.uid(), evidence_paths = evidence_paths || coalesce(p_evidence, '{}') where id = n.id;
end $$;

revoke execute on function
  public.acknowledge_alert(uuid), public.place_hold(uuid, text, text), public.remove_hold(uuid, text),
  public.report_breakdown(uuid, text, text, text[]), public.resolve_breakdown(uuid, text, text[]),
  public.record_regulator_notice(uuid, text, text, date, text, text, date, text[]),
  public.clear_regulator_notice(uuid, date, text, text[])
from public, anon;
grant execute on function
  public.acknowledge_alert(uuid), public.place_hold(uuid, text, text), public.remove_hold(uuid, text),
  public.report_breakdown(uuid, text, text, text[]), public.resolve_breakdown(uuid, text, text[]),
  public.record_regulator_notice(uuid, text, text, date, text, text, date, text[]),
  public.clear_regulator_notice(uuid, date, text, text[])
to authenticated;
revoke execute on function app.escalate_alerts(timestamptz), app.raise_critical_alert(uuid, uuid, text, text, text, text, uuid, uuid),
  app.notify(uuid, text, text, text, uuid, boolean, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule escalation (hosted project; skipped where pg_cron isn't available)
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('hvems-escalate-alerts', '*/5 * * * *', 'select app.escalate_alerts()');
  end if;
end $do$;
