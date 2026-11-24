-- =============================================================================
-- * Invitations reach any organisation with a provider profile, including a
--   company working as a provider (decision O-13); never the poster itself.
-- * Cases (ADM-05): an HVEMS owner and internal notes, kept in the case history.
-- * Closing an organisation (ACC, SoW 3.8): the Owner / Account Owner / Provider
--   Owner closes it after a full export in the last 7 days, with no work in
--   progress. Open jobs are withdrawn and active proposals withdrawn; members lose
--   access (closed organisations are excluded everywhere); history is kept and
--   HVEMS staff can still read it. A Platform Administrator can reopen it.
--   Billing stops and the final invoice follow with billing (2D, Stripe).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Invitations (MKT-21) for companies working as providers
-- ---------------------------------------------------------------------------
create or replace function public.invite_providers(p_job_id uuid, p_provider_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_n integer;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'marketplace.post');
  if j.status <> 'open' then perform app.raise('invalid_status', 'Only an open job takes invitations'); end if;
  insert into public.marketplace_job_invites (job_id, provider_id)
  select j.id, pp.organisation_id from public.provider_profiles pp
  where pp.organisation_id = any (p_provider_ids) and pp.organisation_id <> j.organisation_id
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select pp.organisation_id, m.user_id, 'marketplace_job', 'You''re invited to propose: ' || j.title, j.suburb, 'jobs/' || j.id
  from public.provider_profiles pp
  join public.org_memberships m on m.organisation_id = pp.organisation_id and m.status = 'active'
    and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator')
  where pp.organisation_id = any (p_provider_ids) and pp.organisation_id <> j.organisation_id;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Case owner and internal notes (ADM-05)
-- ---------------------------------------------------------------------------
create or replace function public.assign_marketplace_case(p_case_id uuid, p_owner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.marketplace_cases%rowtype;
begin
  if not app.is_platform_staff() then perform app.raise('forbidden', 'HVEMS staff only'); end if;
  select * into c from public.marketplace_cases where id = p_case_id for update;
  if c.id is null then perform app.raise('not_found', 'Case not found'); end if;
  if p_owner_id is not null and not exists (select 1 from public.platform_staff s where s.user_id = p_owner_id and s.active) then
    perform app.raise('not_staff', 'Choose an HVEMS staff member');
  end if;
  update public.marketplace_cases set owner_id = p_owner_id where id = c.id;
  insert into public.marketplace_case_events (case_id, event, note)
  values (c.id, 'owner_changed', coalesce((select coalesce(full_name, email) from public.profiles where id = p_owner_id), 'No owner'));
end $$;
revoke execute on function public.assign_marketplace_case(uuid, uuid) from public, anon;
grant execute on function public.assign_marketplace_case(uuid, uuid) to authenticated, service_role;

-- Internal notes are visible to HVEMS staff only (the parties see raised / responded / outcome events).
alter table public.marketplace_case_events add column internal boolean not null default false;
drop policy marketplace_case_events_read on public.marketplace_case_events;
create policy marketplace_case_events_read on public.marketplace_case_events for select to authenticated using (
  (select app.is_platform_staff())
  or (not internal and exists (select 1 from public.marketplace_cases c where c.id = marketplace_case_events.case_id)));

create or replace function public.add_marketplace_case_note(p_case_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_staff() then perform app.raise('forbidden', 'HVEMS staff only'); end if;
  if not exists (select 1 from public.marketplace_cases where id = p_case_id) then perform app.raise('not_found', 'Case not found'); end if;
  if char_length(btrim(coalesce(p_note, ''))) < 2 then perform app.raise('note_required', 'Write the note'); end if;
  insert into public.marketplace_case_events (case_id, event, note, internal) values (p_case_id, 'note', btrim(p_note), true);
end $$;
revoke execute on function public.add_marketplace_case_note(uuid, text) from public, anon;
grant execute on function public.add_marketplace_case_note(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Closing an organisation
-- ---------------------------------------------------------------------------
alter table public.organisations add column close_reason text check (close_reason is null or char_length(close_reason) <= 1000);
alter table public.organisations add column closed_by uuid references auth.users (id) on delete set null;
create index organisations_closed_by_idx on public.organisations (closed_by);

-- What still has to finish before closing; an empty list means it can close.
create or replace function public.closure_blockers(p_organisation_id uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v text[] := '{}';
begin
  perform app.require_capability(p_organisation_id, 'org.close');
  if not exists (select 1 from public.audit_events e where e.organisation_id = p_organisation_id and e.action = 'export'
                 and e.context ->> 'report' = 'full-export' and e.occurred_at > now() - interval '7 days') then
    v := array_append(v, 'Download a full export first (Reports → Full export); it must be from the last 7 days.');
  end if;
  if exists (select 1 from public.marketplace_engagements e where (e.organisation_id = p_organisation_id or e.provider_id = p_organisation_id)
             and app.engagement_live(e.status)) then
    v := array_append(v, 'Finish or cancel the marketplace engagements in progress.');
  end if;
  if exists (select 1 from public.marketplace_cases c join public.marketplace_engagements e on e.id = c.engagement_id
             where (e.organisation_id = p_organisation_id or e.provider_id = p_organisation_id) and c.status in ('awaiting_response', 'under_review')) then
    v := array_append(v, 'Wait for open marketplace cases to be decided.');
  end if;
  return v;
end $$;
revoke execute on function public.closure_blockers(uuid) from public, anon;
grant execute on function public.closure_blockers(uuid) to authenticated, service_role;

create or replace function public.close_organisation(p_organisation_id uuid, p_confirm_name text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.organisations%rowtype;
  v_blockers text[];
begin
  perform app.require_capability(p_organisation_id, 'org.close');
  select * into o from public.organisations where id = p_organisation_id for update;
  if o.id is null or o.status = 'closed' then perform app.raise('not_found', 'Organisation not found'); end if;
  if btrim(coalesce(p_confirm_name, '')) <> o.name then perform app.raise('confirm_name', 'Type the organisation''s name exactly to confirm'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give the reason for closing'); end if;
  v_blockers := public.closure_blockers(p_organisation_id);
  if cardinality(v_blockers) > 0 then perform app.raise('closure_blocked', v_blockers[1]); end if;
  -- Nothing left open in the marketplace.
  update public.marketplace_jobs set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Organisation closed'
  where organisation_id = o.id and status = 'open';
  update public.marketplace_proposals set status = 'withdrawn', updated_at = now() where provider_id = o.id and status = 'active';
  update public.organisations set status = 'closed', closed_at = now(), closed_by = auth.uid(), close_reason = btrim(p_reason) where id = o.id;
  perform app.audit('close', 'organisations', o.id, o.id, jsonb_build_object('status', jsonb_build_object('from', o.status, 'to', 'closed')),
    jsonb_build_object('reason', btrim(p_reason)));
end $$;
revoke execute on function public.close_organisation(uuid, text, text) from public, anon;
grant execute on function public.close_organisation(uuid, text, text) to authenticated, service_role;

create or replace function public.reopen_organisation(p_organisation_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.organisations%rowtype;
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Platform Administrator reopens an organisation');
  end if;
  select * into o from public.organisations where id = p_organisation_id for update;
  if o.id is null or o.status <> 'closed' then perform app.raise('invalid_status', 'This organisation is not closed'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give the reason for reopening'); end if;
  update public.organisations set status = 'active', closed_at = null, closed_by = null, close_reason = null where id = o.id;
  perform app.audit('reopen', 'organisations', o.id, o.id, jsonb_build_object('status', jsonb_build_object('from', 'closed', 'to', 'active')),
    jsonb_build_object('reason', btrim(p_reason)));
end $$;
revoke execute on function public.reopen_organisation(uuid, text) from public, anon;
grant execute on function public.reopen_organisation(uuid, text) to authenticated, service_role;

-- The full export is logged by whoever may take it (data.full_export: Owner, Account Owner, Provider Owner),
-- not only report readers, so every account type can export before closing.
create or replace function public.log_report_export(p_organisation_id uuid, p_report text, p_rows integer, p_filters jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if p_report = 'full-export' then
    perform app.require_capability(p_organisation_id, 'data.full_export');
  else
    perform app.require_capability(p_organisation_id, 'reports.export');
  end if;
  if p_report is null or p_report !~ '^[a-z0-9_-]{2,60}$' then
    perform app.raise('invalid_report', 'Unknown report');
  end if;
  perform app.audit('export', 'report', null, p_organisation_id, '{}'::jsonb,
    jsonb_build_object('report', p_report, 'rows', coalesce(p_rows, 0), 'filters', coalesce(p_filters, '{}'::jsonb)));
end $fn$;
