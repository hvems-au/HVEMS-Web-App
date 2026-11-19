-- =============================================================================
-- 2D Marketplace, part 3: acceptance, engagements, work, completion, reviews,
-- cancellations, no-shows, strikes and cases (SoW 4.5, 4.7, 4.8; MKT-10..19, 23, 24).
-- * Accepting creates one engagement per job (a unique index makes two accepts at
--   once produce one). Connection fees are recorded on the engagement; collecting
--   them (ADR-006, Stripe) waits on approval A-02, so while the setting
--   marketplace.connection_fees_live is false nothing is charged and fee_status
--   is 'not_live'. Billing will switch it on without changing this flow.
-- * On confirmation the provider sees the address, site access and safety notes,
--   all files and the poster's contacts; messages are no longer masked; the other
--   proposals become Not selected; the work order shows the provider.
-- * Provider findings: Critical opens a defect at once with the asset Broken/Out of
--   service "awaiting review"; Minor and Advisory wait for the company to confirm.
-- * Completion never clears a defect or returns equipment to service.
-- =============================================================================

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('marketplace.connection_fees_live', 'false', 'Collect connection fees on acceptance (off until Stripe billing and A-02)', 'to_be_confirmed', '§4.5, ADR-006'),
  ('marketplace.completion_confirm_days', '7', 'Days the poster has to confirm completion or ask for a correction', 'confirmed', '§4.7'),
  ('marketplace.review_window_days', '14', 'Days after completion in which the poster can review', 'confirmed', '§4.7'),
  ('marketplace.follow_up_days', '30', 'A follow-up with the same provider within this many days has no connection fee', 'confirmed', '§4.7'),
  ('marketplace.case_response_hours', '48', 'Hours the other party has to respond to a case or no-show', 'confirmed', '§4.8'),
  ('marketplace.no_show_urgent_minutes', '60', 'Minutes past the committed arrival before an urgent no-show can be reported', 'confirmed', '§4.8'),
  ('marketplace.no_show_standard_minutes', '120', 'Minutes past the start of the agreed window before a standard no-show can be reported', 'confirmed', '§4.8'),
  ('marketplace.strike_limit', '3', 'Strikes in the strike window that open an HVEMS review', 'confirmed', '§4.8'),
  ('marketplace.strike_window_days', '90', 'Days strikes count for', 'confirmed', '§4.8')
on conflict (key) do nothing;

alter table public.defects drop constraint defects_source_check;
alter table public.defects add constraint defects_source_check check (source in ('prestart', 'operator_report', 'provider_finding'));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed', 'meter_reading_review', 'parts_approval', 'parts_decision', 'document_expiring',
  'provider_verification', 'provider_document_expiring', 'marketplace_job', 'marketplace_message', 'marketplace_proposal',
  'marketplace_engagement', 'marketplace_case'));

-- Notify the poster's buyers (the person who posted, Owners / Account Owners) or the provider's managers.
create or replace function app.notify_party(p_org uuid, p_poster_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p_org, m.user_id, p_kind, p_title, p_body, p_link
  from public.org_memberships m
  where m.organisation_id = p_org and m.status = 'active'
    and (m.user_id = p_poster_user or m.role in ('owner', 'account_owner', 'provider_owner', 'provider_manager'))
$$;

-- ---------------------------------------------------------------------------
-- Engagements
-- ---------------------------------------------------------------------------
create table public.marketplace_engagements (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  job_id uuid not null references public.marketplace_jobs (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  provider_id uuid not null references public.organisations (id) on delete cascade,
  proposal_id uuid not null references public.marketplace_proposals (id),
  -- The exact version accepted (MKT-09).
  proposal_version_id uuid not null references public.marketplace_proposal_versions (id),
  status text not null default 'confirmed' check (status in ('confirmed', 'on_my_way', 'on_site', 'completed', 'correction_requested',
    'confirmed_complete', 'completed_unconfirmed', 'no_show_reported', 'cancelled')),
  accepted_by uuid not null references auth.users (id) default auth.uid(),
  accepted_at timestamptz not null default now(),
  -- Connection fees (SoW 5.4; ADR-006). 'not_live' until billing collects them.
  poster_fee_cents bigint not null default 0,
  provider_fee_cents bigint not null default 0,
  fee_status text not null default 'not_live' check (fee_status in ('not_live', 'waived_follow_up', 'collected', 'refunded', 'pending_provider')),
  follow_up_of uuid references public.marketplace_engagements (id),
  technician_id uuid references auth.users (id) on delete set null,
  safety_acknowledged_at timestamptz,
  scheduled_start timestamptz,
  on_my_way_at timestamptz,
  eta_at timestamptz,
  on_site_at timestamptz,
  completion_outcome text check (completion_outcome is null or completion_outcome in ('complete', 'partial')),
  completion_notes text check (completion_notes is null or char_length(completion_notes) <= 4000),
  parts_used text check (parts_used is null or char_length(parts_used) <= 2000),
  remaining_issues text check (remaining_issues is null or char_length(remaining_issues) <= 2000),
  recommendations text check (recommendations is null or char_length(recommendations) <= 2000),
  completion_paths text[] not null default '{}' check (cardinality(completion_paths) <= 12),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  correction_reason text,
  correction_requested_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  payment_reported_by text check (payment_reported_by is null or payment_reported_by in ('poster', 'provider')),
  payment_reported_at timestamptz,
  payment_note text check (payment_note is null or char_length(payment_note) <= 500),
  cancelled_at timestamptz,
  cancelled_by_side text check (cancelled_by_side is null or cancelled_by_side in ('poster', 'provider', 'hvems')),
  cancel_category text check (cancel_category is null or cancel_category in ('no_longer_needed', 'found_another', 'cannot_attend', 'price_changed', 'safety', 'no_show', 'other')),
  cancel_reason text,
  unique (id, organisation_id)
);
-- One live engagement per job: concurrent acceptances create exactly one (MKT-10).
create unique index marketplace_engagements_one_live on public.marketplace_engagements (job_id)
  where status in ('confirmed', 'on_my_way', 'on_site', 'completed', 'correction_requested', 'no_show_reported');
create index marketplace_engagements_org_idx on public.marketplace_engagements (organisation_id, accepted_at desc);
create index marketplace_engagements_provider_idx on public.marketplace_engagements (provider_id, accepted_at desc);
create index marketplace_engagements_job_idx on public.marketplace_engagements (job_id);
create index marketplace_engagements_proposal_idx on public.marketplace_engagements (proposal_id);
create index marketplace_engagements_version_idx on public.marketplace_engagements (proposal_version_id);
create index marketplace_engagements_follow_up_idx on public.marketplace_engagements (follow_up_of);
create index marketplace_engagements_people_idx on public.marketplace_engagements (accepted_by, technician_id, completed_by, confirmed_by);
create index marketplace_engagements_tech_idx on public.marketplace_engagements (technician_id);
create index marketplace_engagements_completed_by_idx on public.marketplace_engagements (completed_by);
create index marketplace_engagements_confirmed_by_idx on public.marketplace_engagements (confirmed_by);
create trigger audit_marketplace_engagements after insert or update or delete on public.marketplace_engagements
  for each row execute function app.audit_row_change('organisation_id');
alter table public.marketplace_engagements enable row level security;
revoke all on public.marketplace_engagements from anon, authenticated;
grant select on public.marketplace_engagements to authenticated;
create policy marketplace_engagements_read on public.marketplace_engagements for select to authenticated using (
  provider_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('marketplace.post'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('marketplace.accept'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or (select app.is_platform_staff()));

create or replace function app.engagement_live(s text) returns boolean
language sql immutable set search_path = '' as $$
  select s in ('confirmed', 'on_my_way', 'on_site', 'completed', 'correction_requested', 'no_show_reported')
$$;

-- Which side the caller is on, or null.
create or replace function app.engagement_side(e public.marketplace_engagements) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.has_capability(e.provider_id, 'provider.engagements.manage') or app.has_capability(e.provider_id, 'provider.engagements.work') then
    return 'provider';
  elsif app.has_capability(e.organisation_id, 'marketplace.accept') or app.has_capability(e.organisation_id, 'marketplace.post') then
    return 'poster';
  end if;
  return null;
end $$;

create or replace function app.lock_engagement(p_id uuid) returns public.marketplace_engagements
language plpgsql security definer set search_path = '' as $$
declare e public.marketplace_engagements%rowtype;
begin
  select * into e from public.marketplace_engagements where id = p_id for update;
  if e.id is null then perform app.raise('not_found', 'Engagement not found'); end if;
  return e;
end $$;

-- Accept a proposal (MKT-10, FEE-04 when billing is live).
create or replace function public.accept_marketplace_proposal(p_proposal_id uuid, p_follow_up_of uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pr public.marketplace_proposals%rowtype;
  v public.marketplace_proposal_versions%rowtype;
  j public.marketplace_jobs%rowtype;
  f public.marketplace_engagements%rowtype;
  v_block text;
  v_fee bigint;
  v_live boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'marketplace.connection_fees_live'), false);
  v_follow boolean := false;
  v_id uuid;
  v_provider_name text;
begin
  select * into pr from public.marketplace_proposals where id = p_proposal_id;
  if pr.id is null then perform app.raise('not_found', 'Proposal not found'); end if;
  -- Lock the job: two people accepting at once are handled one after the other.
  select * into j from public.marketplace_jobs where id = pr.job_id for update;
  perform app.require_capability(j.organisation_id, 'marketplace.accept');
  select * into pr from public.marketplace_proposals where id = p_proposal_id for update;
  if exists (select 1 from public.marketplace_engagements e where e.job_id = j.id and app.engagement_live(e.status)) then
    perform app.raise('already_engaged', 'This job already has an engagement');
  end if;
  if j.status <> 'open' then perform app.raise('job_closed', 'This job is not open'); end if;
  if pr.status <> 'active' or pr.valid_until <= now() then
    perform app.raise('proposal_unavailable', 'This proposal has expired or been withdrawn');
  end if;
  v_block := app.provider_proposal_block(pr.provider_id);
  if v_block is not null then perform app.raise('provider_not_eligible', 'This provider can''t take the job right now'); end if;
  if v_live then
    perform app.raise('fees_unavailable', 'Connection fee payments are not available yet');
  end if;
  select * into v from public.marketplace_proposal_versions where proposal_id = pr.id and version = pr.version;

  -- Follow-up with the same provider within 30 days: no connection fee for either party (SoW 4.7).
  if p_follow_up_of is not null then
    select * into f from public.marketplace_engagements where id = p_follow_up_of and organisation_id = j.organisation_id;
    if f.id is null or f.provider_id <> pr.provider_id or f.status not in ('confirmed_complete', 'completed_unconfirmed')
       or coalesce(f.completed_at, f.confirmed_at) < now() - make_interval(days => coalesce(app.setting_int('marketplace.follow_up_days'), 30)) then
      perform app.raise('not_a_follow_up', 'A follow-up must be with the same provider within 30 days of completion');
    end if;
    v_follow := true;
  end if;
  v_fee := case when v_follow then 0 else v.fee_cents end;

  insert into public.marketplace_engagements (job_id, organisation_id, provider_id, proposal_id, proposal_version_id,
    poster_fee_cents, provider_fee_cents, fee_status, follow_up_of)
  values (j.id, j.organisation_id, pr.provider_id, pr.id, v.id, v_fee, v_fee,
          case when v_follow then 'waived_follow_up' else 'not_live' end, p_follow_up_of)
  returning id into v_id;

  update public.marketplace_proposals set status = 'accepted', updated_at = now() where id = pr.id;
  update public.marketplace_proposals set status = 'not_selected', updated_at = now() where job_id = j.id and id <> pr.id and status = 'active';
  update public.marketplace_jobs set status = 'engaged' where id = j.id;
  select name into v_provider_name from public.organisations where id = pr.provider_id;
  if j.work_order_id is not null then
    update public.work_orders set vendor_name = v_provider_name, status = case when status = 'open' then 'in_progress' else status end,
      started_at = coalesce(started_at, now())
    where id = j.work_order_id;
  end if;

  perform app.notify_party(pr.provider_id, null, 'marketplace_engagement', 'Accepted: ' || j.title,
    'The customer accepted your proposal. Site details are now on the engagement.', 'engagements/' || v_id);
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p.provider_id, m.user_id, 'marketplace_proposal', 'Not selected: ' || j.title, 'The customer chose another proposal.', 'jobs/' || j.id
  from public.marketplace_proposals p
  join public.org_memberships m on m.organisation_id = p.provider_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager')
  where p.job_id = j.id and p.status = 'not_selected' and p.id <> pr.id;
  return v_id;
exception when unique_violation then
  perform app.raise('already_engaged', 'This job already has an engagement');
end $$;
revoke execute on function public.accept_marketplace_proposal(uuid, uuid) from public, anon;
grant execute on function public.accept_marketplace_proposal(uuid, uuid) to authenticated, service_role;

-- What the engaged provider may now see (MKT-11). Providers that weren't selected never get here.
create or replace function public.engagement_details(p_engagement_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype;
  j public.marketplace_jobs%rowtype;
  o public.organisations%rowtype;
  pp public.provider_profiles%rowtype;
  po public.organisations%rowtype;
  v_side text;
begin
  select * into e from public.marketplace_engagements where id = p_engagement_id;
  if e.id is null then perform app.raise('not_found', 'Engagement not found'); end if;
  v_side := app.engagement_side(e);
  if v_side is null and not app.is_platform_staff() then perform app.raise('not_found', 'Engagement not found'); end if;
  select * into j from public.marketplace_jobs where id = e.job_id;
  select * into o from public.organisations where id = e.organisation_id;
  select * into po from public.organisations where id = e.provider_id;
  select * into pp from public.provider_profiles where organisation_id = e.provider_id;
  return jsonb_build_object(
    'engagement', to_jsonb(e),
    'job', app.job_public(j) || jsonb_build_object('address', j.address, 'site_access_notes', j.site_access_notes, 'work_order_id', j.work_order_id),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'path', f.path, 'shared', f.shared) order by f.created_at)
                       from public.marketplace_job_files f where f.job_id = j.id), '[]'::jsonb),
    'terms', (select to_jsonb(v) - 'created_by' from public.marketplace_proposal_versions v where v.id = e.proposal_version_id),
    'poster', jsonb_build_object('name', o.name, 'contact_name', coalesce(o.contact_name, (select full_name from public.profiles where id = j.posted_by)),
                                 'contact_email', coalesce(o.contact_email, (select email from public.profiles where id = j.posted_by)), 'contact_phone', o.contact_phone),
    'provider', jsonb_build_object('id', po.id, 'name', po.name, 'contact_name', pp.contact_name, 'contact_phone', pp.contact_phone, 'contact_email', pp.contact_email),
    'side', v_side);
end $$;
revoke execute on function public.engagement_details(uuid) from public, anon;
grant execute on function public.engagement_details(uuid) to authenticated, service_role;

-- After confirmation, messages between the two parties aren't masked (MKT-08 applies before confirmation).
create or replace function app.post_message(p_job uuid, p_provider uuid, p_from_provider boolean, p_body text, p_clarification boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_engaged boolean := exists (select 1 from public.marketplace_engagements e where e.job_id = p_job and e.provider_id = p_provider and e.status <> 'cancelled');
  v_masked text := case when v_engaged then btrim(p_body) else app.mask_contacts(btrim(p_body)) end;
  v_id uuid;
begin
  insert into public.marketplace_messages (job_id, provider_id, from_provider, body, masked, is_clarification)
  values (p_job, p_provider, p_from_provider, v_masked, v_masked <> btrim(p_body), p_clarification)
  returning id into v_id;
  if v_masked <> btrim(p_body) then
    insert into public.marketplace_message_flags (message_id, original_body) values (v_id, btrim(p_body));
  end if;
  return v_id;
end $$;

-- Engaged parties keep messaging after the job leaves "open".
create or replace function public.send_marketplace_message(p_job_id uuid, p_provider_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_from_provider boolean;
  v_engaged boolean;
  v_id uuid;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then perform app.raise('message_required', 'Write a message'); end if;
  v_engaged := exists (select 1 from public.marketplace_engagements e where e.job_id = j.id and e.provider_id = p_provider_id and app.engagement_live(e.status));
  if app.has_capability(p_provider_id, 'provider.jobs.browse') or (v_engaged and app.has_capability(p_provider_id, 'provider.engagements.work')) then
    v_from_provider := true;
    if not app.provider_can_see_job(p_provider_id, j) then perform app.raise('not_found', 'This job isn''t available'); end if;
    if j.status <> 'open' and not v_engaged then perform app.raise('invalid_status', 'This job is no longer open'); end if;
  elsif app.has_capability(j.organisation_id, 'marketplace.post') or app.has_capability(j.organisation_id, 'marketplace.accept') then
    v_from_provider := false;
    if not exists (select 1 from public.marketplace_messages m where m.job_id = j.id and m.provider_id = p_provider_id)
       and not exists (select 1 from public.marketplace_proposals p where p.job_id = j.id and p.provider_id = p_provider_id) then
      perform app.raise('not_found', 'No conversation with this provider');
    end if;
  else
    perform app.raise('forbidden', 'You can''t message on this job');
  end if;
  v_id := app.post_message(j.id, p_provider_id, v_from_provider, p_body);
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select case when v_from_provider then j.organisation_id else p_provider_id end, m.user_id, 'marketplace_message',
         case when v_from_provider then 'New message on ' else 'Reply on ' end || j.title,
         left((select body from public.marketplace_messages where id = v_id), 140),
         case when v_from_provider then 'marketplace/' || j.id else 'jobs/' || j.id end
  from public.org_memberships m
  where m.status = 'active'
    and ((v_from_provider and m.organisation_id = j.organisation_id and (m.user_id = j.posted_by or m.role in ('owner', 'account_owner')))
      or (not v_from_provider and m.organisation_id = p_provider_id and m.role in ('provider_owner', 'provider_manager')));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Provider work: technician, safety, attendance (MKT-11..13)
-- ---------------------------------------------------------------------------
create or replace function public.assign_engagement_technician(p_engagement_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
begin
  perform app.require_capability(e.provider_id, 'provider.engagements.manage');
  if not app.engagement_live(e.status) then perform app.raise('invalid_status', 'This engagement is finished'); end if;
  if p_user_id is not null and not exists (select 1 from public.org_memberships m where m.organisation_id = e.provider_id and m.user_id = p_user_id and m.status = 'active') then
    perform app.raise('not_a_member', 'Choose someone in your team');
  end if;
  update public.marketplace_engagements set technician_id = p_user_id where id = e.id;
end $$;
revoke execute on function public.assign_engagement_technician(uuid, uuid) from public, anon;
grant execute on function public.assign_engagement_technician(uuid, uuid) to authenticated, service_role;

-- p_action: acknowledge_safety | schedule (p_at) | on_my_way (p_minutes) | update_eta (p_minutes) | on_site
create or replace function public.update_engagement_attendance(p_engagement_id uuid, p_action text, p_minutes integer default null, p_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  j public.marketplace_jobs%rowtype;
begin
  if app.engagement_side(e) is distinct from 'provider' then perform app.raise('forbidden', 'Only the provider updates attendance'); end if;
  if e.status not in ('confirmed', 'on_my_way', 'on_site', 'no_show_reported') then perform app.raise('invalid_status', 'This engagement is not in progress'); end if;
  select * into j from public.marketplace_jobs where id = e.job_id;
  if p_action = 'acknowledge_safety' then
    update public.marketplace_engagements set safety_acknowledged_at = coalesce(safety_acknowledged_at, now()) where id = e.id;
  elsif p_action = 'schedule' then
    if p_at is null then perform app.raise('time_required', 'Choose the start time'); end if;
    update public.marketplace_engagements set scheduled_start = p_at where id = e.id;
    perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement', 'Scheduled: ' || j.title,
      'The provider has booked a start time.', 'marketplace/' || j.id);
  elsif p_action in ('on_my_way', 'update_eta') then
    if p_minutes is null or p_minutes not between 1 and 1440 then perform app.raise('eta_required', 'Give the arrival time in minutes'); end if;
    update public.marketplace_engagements set status = case when status = 'confirmed' then 'on_my_way' else status end,
      on_my_way_at = coalesce(on_my_way_at, now()), eta_at = now() + make_interval(mins => p_minutes) where id = e.id;
    perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement',
      case when p_action = 'on_my_way' then 'On the way: ' else 'New arrival time: ' end || j.title,
      format('Arriving in about %s minutes.', p_minutes), 'marketplace/' || j.id);
  elsif p_action = 'on_site' then
    if e.safety_acknowledged_at is null then perform app.raise('safety_ack_required', 'Read and acknowledge the site safety information first'); end if;
    update public.marketplace_engagements set status = 'on_site', on_site_at = coalesce(on_site_at, now()) where id = e.id;
    perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement', 'On site: ' || j.title, 'The provider has checked in on site.', 'marketplace/' || j.id);
  else
    perform app.raise('invalid_action', 'Unknown action');
  end if;
end $$;
revoke execute on function public.update_engagement_attendance(uuid, text, integer, timestamptz) from public, anon;
grant execute on function public.update_engagement_attendance(uuid, text, integer, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Variations (MKT-14): no effect on connection fees
-- ---------------------------------------------------------------------------
create table public.engagement_variations (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.marketplace_engagements (id) on delete cascade,
  proposed_by_side text not null check (proposed_by_side in ('poster', 'provider')),
  proposed_by uuid not null references auth.users (id) default auth.uid(),
  kind text not null check (kind in ('price', 'scope', 'timing')),
  description text not null check (char_length(btrim(description)) between 3 and 2000),
  new_amount_cents bigint check (new_amount_cents is null or new_amount_cents >= 0),
  new_date date,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index engagement_variations_engagement_idx on public.engagement_variations (engagement_id);
create index engagement_variations_people_idx on public.engagement_variations (proposed_by);
create index engagement_variations_decided_by_idx on public.engagement_variations (decided_by);
alter table public.engagement_variations enable row level security;
revoke all on public.engagement_variations from anon, authenticated;
grant select on public.engagement_variations to authenticated;
create policy engagement_variations_read on public.engagement_variations for select to authenticated using (
  exists (select 1 from public.marketplace_engagements e where e.id = engagement_variations.engagement_id));

create or replace function public.propose_engagement_variation(p_engagement_id uuid, p_kind text, p_description text, p_new_amount_cents bigint default null, p_new_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  j public.marketplace_jobs%rowtype;
  v_side text := app.engagement_side(e);
  v_id uuid;
begin
  if v_side is null then perform app.raise('forbidden', 'You are not part of this engagement'); end if;
  if v_side = 'provider' and not app.has_capability(e.provider_id, 'provider.engagements.manage') then
    perform app.raise('forbidden', 'Your Provider Manager proposes changes');
  end if;
  if not app.engagement_live(e.status) then perform app.raise('invalid_status', 'This engagement is finished'); end if;
  if p_kind = 'price' and p_new_amount_cents is null then perform app.raise('amount_required', 'Give the new price'); end if;
  if p_kind = 'timing' and p_new_date is null then perform app.raise('date_required', 'Give the new date'); end if;
  insert into public.engagement_variations (engagement_id, proposed_by_side, kind, description, new_amount_cents, new_date)
  values (e.id, v_side, p_kind, btrim(p_description), p_new_amount_cents, p_new_date) returning id into v_id;
  select * into j from public.marketplace_jobs where id = e.job_id;
  if v_side = 'provider' then
    perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement', 'Change proposed: ' || j.title, btrim(p_description), 'marketplace/' || j.id);
  else
    perform app.notify_party(e.provider_id, null, 'marketplace_engagement', 'Change proposed: ' || j.title, btrim(p_description), 'engagements/' || e.id);
  end if;
  return v_id;
end $$;
revoke execute on function public.propose_engagement_variation(uuid, text, text, bigint, date) from public, anon;
grant execute on function public.propose_engagement_variation(uuid, text, text, bigint, date) to authenticated, service_role;

create or replace function public.decide_engagement_variation(p_variation_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x public.engagement_variations%rowtype;
  e public.marketplace_engagements%rowtype;
  v_side text;
begin
  select * into x from public.engagement_variations where id = p_variation_id for update;
  if x.id is null then perform app.raise('not_found', 'Change not found'); end if;
  e := app.lock_engagement(x.engagement_id);
  v_side := app.engagement_side(e);
  if v_side is null then perform app.raise('forbidden', 'You are not part of this engagement'); end if;
  if x.status <> 'pending' then perform app.raise('invalid_status', 'This change has been decided'); end if;
  if v_side = x.proposed_by_side then perform app.raise('forbidden', 'The other party decides a change you proposed'); end if;
  update public.engagement_variations set status = case when p_accept then 'accepted' else 'declined' end, decided_by = auth.uid(), decided_at = now()
  where id = x.id;
end $$;
revoke execute on function public.decide_engagement_variation(uuid, boolean) from public, anon;
grant execute on function public.decide_engagement_variation(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Findings (MKT-13): suggested issue reports in the company workspace
-- ---------------------------------------------------------------------------
create table public.engagement_findings (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.marketplace_engagements (id) on delete cascade,
  severity public.defect_severity not null,
  title text not null check (char_length(btrim(title)) between 3 and 200),
  description text check (description is null or char_length(description) <= 4000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 8),
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'dismissed', 'recorded')),
  defect_id uuid,
  reported_by uuid not null references auth.users (id) default auth.uid(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index engagement_findings_engagement_idx on public.engagement_findings (engagement_id);
create index engagement_findings_reported_by_idx on public.engagement_findings (reported_by);
create index engagement_findings_decided_by_idx on public.engagement_findings (decided_by);
create index engagement_findings_defect_idx on public.engagement_findings (defect_id);
alter table public.engagement_findings enable row level security;
revoke all on public.engagement_findings from anon, authenticated;
grant select on public.engagement_findings to authenticated;
create policy engagement_findings_read on public.engagement_findings for select to authenticated using (
  exists (select 1 from public.marketplace_engagements e where e.id = engagement_findings.engagement_id));

-- Opens the company defect for a finding (provider_finding). Critical: provisional Broken/Out of service, awaiting review.
create or replace function app.finding_to_defect(f public.engagement_findings, e public.marketplace_engagements) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  a public.assets%rowtype;
  v_id uuid;
  v_cause uuid;
  v_provider text;
begin
  select * into j from public.marketplace_jobs where id = e.job_id;
  if j.asset_id is null then return null; end if;
  select * into a from public.assets where id = j.asset_id;
  select name into v_provider from public.organisations where id = e.provider_id;
  insert into public.defects (organisation_id, asset_id, severity, title, description, source, reported_by, evidence_paths, issue_category)
  values (e.organisation_id, a.id, f.severity, f.title,
          trim(both from coalesce(f.description, '') || E'\n\nReported by ' || v_provider || ' (marketplace engagement ' || e.number || ').'),
          'provider_finding', f.reported_by, '{}', 'other')
  returning id into v_id;
  if f.severity = 'critical' then
    v_cause := app.open_condition_cause(a.id, 'critical_finding_awaiting_review', 'defect', v_id);
    update public.defects set cause_id = v_cause where id = v_id;
    perform app.raise_critical_alert(e.organisation_id, a.id, 'critical_defect',
      format('%s: critical finding by %s: %s', a.asset_number, v_provider, f.title),
      'The equipment is out of service, awaiting your review.', 'defect', v_id);
  elsif f.severity = 'minor' then
    v_cause := app.open_condition_cause(a.id, 'minor_defect', 'defect', v_id);
    update public.defects set cause_id = v_cause where id = v_id;
    perform app.notify(e.organisation_id, 'minor_defect', format('%s: %s', a.asset_number, f.title), format('Reported by %s.', v_provider), a.id);
  end if;
  return v_id;
end $$;

create or replace function public.record_engagement_finding(p_engagement_id uuid, p_severity public.defect_severity, p_title text, p_description text default null, p_photo_paths text[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  f public.engagement_findings%rowtype;
  j public.marketplace_jobs%rowtype;
begin
  if app.engagement_side(e) is distinct from 'provider' then perform app.raise('forbidden', 'Only the provider records findings'); end if;
  if not app.engagement_live(e.status) then perform app.raise('invalid_status', 'This engagement is finished'); end if;
  select * into j from public.marketplace_jobs where id = e.job_id;
  insert into public.engagement_findings (engagement_id, severity, title, description, photo_paths,
    status)
  values (e.id, p_severity, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_photo_paths, '{}'),
    -- Marketplace-only customers: findings stay in the engagement (MKT-13).
    case when j.asset_id is null then 'recorded' else 'suggested' end)
  returning * into f;
  -- Critical findings act at once (DEF-12); the company still reviews them.
  if f.severity = 'critical' and j.asset_id is not null then
    update public.engagement_findings set defect_id = app.finding_to_defect(f, e), status = 'confirmed', decided_at = now() where id = f.id;
  end if;
  perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement',
    case when f.severity = 'critical' then 'CRITICAL finding: ' else 'Finding to review: ' end || btrim(p_title), j.title, 'marketplace/' || j.id);
  return f.id;
end $$;
revoke execute on function public.record_engagement_finding(uuid, public.defect_severity, text, text, text[]) from public, anon;
grant execute on function public.record_engagement_finding(uuid, public.defect_severity, text, text, text[]) to authenticated, service_role;

create or replace function public.decide_engagement_finding(p_finding_id uuid, p_confirm boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.engagement_findings%rowtype;
  e public.marketplace_engagements%rowtype;
begin
  select * into f from public.engagement_findings where id = p_finding_id for update;
  if f.id is null then perform app.raise('not_found', 'Finding not found'); end if;
  select * into e from public.marketplace_engagements where id = f.engagement_id;
  perform app.require_capability(e.organisation_id, 'defects.report');
  if f.status <> 'suggested' then perform app.raise('invalid_status', 'This finding has been decided'); end if;
  update public.engagement_findings
  set status = case when p_confirm then 'confirmed' else 'dismissed' end, decided_by = auth.uid(), decided_at = now(),
      defect_id = case when p_confirm then app.finding_to_defect(f, e) else null end
  where id = f.id;
end $$;
revoke execute on function public.decide_engagement_finding(uuid, boolean) from public, anon;
grant execute on function public.decide_engagement_finding(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Completion and confirmation (MKT-15); payment record (MKT-19)
-- ---------------------------------------------------------------------------
create or replace function public.submit_engagement_completion(
  p_engagement_id uuid, p_outcome text, p_notes text, p_parts text default null, p_remaining text default null,
  p_recommendations text default null, p_paths text[] default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  j public.marketplace_jobs%rowtype;
begin
  if app.engagement_side(e) is distinct from 'provider' then perform app.raise('forbidden', 'Only the provider submits the completion report'); end if;
  if e.status not in ('confirmed', 'on_my_way', 'on_site', 'correction_requested') then perform app.raise('invalid_status', 'This engagement can''t be completed now'); end if;
  if p_outcome not in ('complete', 'partial') then perform app.raise('outcome_required', 'Say whether the work is complete or partly complete'); end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 3 then perform app.raise('notes_required', 'Describe the work done'); end if;
  if exists (select 1 from unnest(coalesce(p_paths, '{}')) x where left(x, 37) <> e.provider_id::text || '/' or x like '%..%') then
    perform app.raise('invalid_path', 'A file was not uploaded for this provider');
  end if;
  update public.marketplace_engagements
  set status = 'completed', completion_outcome = p_outcome, completion_notes = btrim(p_notes),
      parts_used = nullif(btrim(coalesce(p_parts, '')), ''), remaining_issues = nullif(btrim(coalesce(p_remaining, '')), ''),
      recommendations = nullif(btrim(coalesce(p_recommendations, '')), ''), completion_paths = coalesce(p_paths, '{}'),
      completed_at = now(), completed_by = auth.uid(), correction_reason = null
  where id = e.id;
  select * into j from public.marketplace_jobs where id = e.job_id;
  perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement', 'Completed: ' || j.title,
    'Confirm the work or ask for a correction within 7 days.', 'marketplace/' || j.id);
end $$;
revoke execute on function public.submit_engagement_completion(uuid, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.submit_engagement_completion(uuid, text, text, text, text, text, text[]) to authenticated, service_role;

create or replace function public.confirm_engagement_completion(p_engagement_id uuid, p_confirm boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  j public.marketplace_jobs%rowtype;
begin
  if app.engagement_side(e) is distinct from 'poster' then perform app.raise('forbidden', 'The customer confirms completion'); end if;
  if e.status <> 'completed' then perform app.raise('invalid_status', 'There is no completion report to confirm'); end if;
  select * into j from public.marketplace_jobs where id = e.job_id;
  if p_confirm then
    update public.marketplace_engagements set status = 'confirmed_complete', confirmed_at = now(), confirmed_by = auth.uid() where id = e.id;
    update public.marketplace_jobs set status = 'closed' where id = j.id;
    -- The work order records the work as completed; a manager still reviews and closes it.
    -- Confirmation never clears defects or returns equipment to service (MKT-15, DEF-19).
    if j.work_order_id is not null then
      update public.work_orders
      set status = case when status in ('open', 'in_progress') then 'completed' else status end,
          completed_at = coalesce(completed_at, now()), completion_notes = coalesce(completion_notes, left(e.completion_notes, 2000))
      where id = j.work_order_id;
    end if;
    perform app.notify_party(e.provider_id, null, 'marketplace_engagement', 'Completion confirmed: ' || j.title, 'The customer confirmed your work.', 'engagements/' || e.id);
  else
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Say what needs correcting'); end if;
    update public.marketplace_engagements set status = 'correction_requested', correction_reason = btrim(p_reason), correction_requested_at = now() where id = e.id;
    perform app.notify_party(e.provider_id, null, 'marketplace_engagement', 'Correction requested: ' || j.title, btrim(p_reason), 'engagements/' || e.id);
  end if;
end $$;
revoke execute on function public.confirm_engagement_completion(uuid, boolean, text) from public, anon;
grant execute on function public.confirm_engagement_completion(uuid, boolean, text) to authenticated, service_role;

create or replace function public.report_job_payment(p_engagement_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  v_side text := app.engagement_side(e);
begin
  if v_side is null then perform app.raise('forbidden', 'You are not part of this engagement'); end if;
  update public.marketplace_engagements set payment_reported_by = v_side, payment_reported_at = now(), payment_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = e.id;
end $$;
revoke execute on function public.report_job_payment(uuid, text) from public, anon;
grant execute on function public.report_job_payment(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Strikes and cases (MKT-16, 18, 24)
-- ---------------------------------------------------------------------------
create table public.marketplace_cases (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  engagement_id uuid references public.marketplace_engagements (id) on delete cascade,
  provider_id uuid references public.organisations (id) on delete cascade,
  raised_by_side text not null check (raised_by_side in ('poster', 'provider', 'hvems')),
  raised_by uuid references auth.users (id) on delete set null default auth.uid(),
  category text not null check (category in ('no_show', 'conduct', 'safety', 'fee', 'strike_review', 'other')),
  description text not null check (char_length(btrim(description)) between 3 and 4000),
  evidence_paths text[] not null default '{}',
  status text not null default 'awaiting_response' check (status in ('awaiting_response', 'under_review', 'decided', 'closed')),
  respond_by timestamptz,
  response text,
  responded_at timestamptz,
  owner_id uuid references auth.users (id) on delete set null,
  outcome text,
  upheld boolean,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index marketplace_cases_engagement_idx on public.marketplace_cases (engagement_id);
create index marketplace_cases_provider_idx on public.marketplace_cases (provider_id);
create index marketplace_cases_status_idx on public.marketplace_cases (status, created_at);
create index marketplace_cases_raised_by_idx on public.marketplace_cases (raised_by);
create index marketplace_cases_owner_idx on public.marketplace_cases (owner_id);
create index marketplace_cases_decided_by_idx on public.marketplace_cases (decided_by);
create trigger audit_marketplace_cases after insert or update or delete on public.marketplace_cases
  for each row execute function app.audit_row_change('provider_id');
alter table public.marketplace_cases enable row level security;
revoke all on public.marketplace_cases from anon, authenticated;
grant select on public.marketplace_cases to authenticated;
create policy marketplace_cases_read on public.marketplace_cases for select to authenticated using (
  (engagement_id is not null and exists (select 1 from public.marketplace_engagements e where e.id = marketplace_cases.engagement_id))
  or (select app.is_platform_staff()));

create table public.marketplace_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.marketplace_cases (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  event text not null,
  note text,
  created_at timestamptz not null default now()
);
create index marketplace_case_events_case_idx on public.marketplace_case_events (case_id, created_at);
create index marketplace_case_events_actor_idx on public.marketplace_case_events (actor_id);
alter table public.marketplace_case_events enable row level security;
revoke all on public.marketplace_case_events from anon, authenticated;
grant select on public.marketplace_case_events to authenticated;
create policy marketplace_case_events_read on public.marketplace_case_events for select to authenticated using (
  exists (select 1 from public.marketplace_cases c where c.id = marketplace_case_events.case_id));

create table public.provider_strikes (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.organisations (id) on delete cascade,
  engagement_id uuid references public.marketplace_engagements (id) on delete set null,
  reason text not null check (reason in ('provider_cancellation', 'no_show')),
  created_at timestamptz not null default now()
);
create index provider_strikes_provider_idx on public.provider_strikes (provider_id, created_at desc);
create index provider_strikes_engagement_idx on public.provider_strikes (engagement_id);
alter table public.provider_strikes enable row level security;
revoke all on public.provider_strikes from anon, authenticated;
grant select on public.provider_strikes to authenticated;
create policy provider_strikes_read on public.provider_strikes for select to authenticated using (
  provider_id = any ((select app.orgs_with_capability('org.view'))::uuid[]) or (select app.is_platform_staff()));

-- Three strikes in 90 days open an automatic review case (MKT-24).
create or replace function app.add_strike(p_provider uuid, p_engagement uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  insert into public.provider_strikes (provider_id, engagement_id, reason) values (p_provider, p_engagement, p_reason);
  select count(*) into v_n from public.provider_strikes
  where provider_id = p_provider and created_at > now() - make_interval(days => coalesce(app.setting_int('marketplace.strike_window_days'), 90));
  if v_n >= coalesce(app.setting_int('marketplace.strike_limit'), 3)
     and not exists (select 1 from public.marketplace_cases c where c.provider_id = p_provider and c.category = 'strike_review' and c.status in ('awaiting_response', 'under_review')) then
    insert into public.marketplace_cases (provider_id, raised_by_side, raised_by, category, description, status)
    values (p_provider, 'hvems', null, 'strike_review', format('%s strikes in %s days: HVEMS review (warning or suspension).', v_n,
            coalesce(app.setting_int('marketplace.strike_window_days'), 90)), 'under_review');
  end if;
end $$;

-- Reopen a job after a provider cancellation or an upheld no-show: remaining valid proposals can be accepted (MKT-16).
create or replace function app.reopen_job(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.marketplace_jobs set status = 'open', closes_at = greatest(closes_at, now() + interval '24 hours') where id = p_job;
  update public.marketplace_proposals set status = 'active', updated_at = now()
  where job_id = p_job and status = 'not_selected' and valid_until > now();
end $$;

create or replace function public.cancel_marketplace_engagement(p_engagement_id uuid, p_category text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  j public.marketplace_jobs%rowtype;
  v_side text := app.engagement_side(e);
begin
  if v_side is null then perform app.raise('forbidden', 'You are not part of this engagement'); end if;
  if v_side = 'provider' and not app.has_capability(e.provider_id, 'provider.engagements.manage') then
    perform app.raise('forbidden', 'Your Provider Manager cancels engagements');
  end if;
  if e.status not in ('confirmed', 'on_my_way', 'on_site', 'no_show_reported') then perform app.raise('invalid_status', 'This engagement can''t be cancelled now'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give the reason'); end if;
  update public.marketplace_engagements
  set status = 'cancelled', cancelled_at = now(), cancelled_by_side = v_side, cancel_category = coalesce(p_category, 'other'), cancel_reason = btrim(p_reason)
  where id = e.id;
  select * into j from public.marketplace_jobs where id = e.job_id;
  if v_side = 'provider' then
    perform app.add_strike(e.provider_id, e.id, 'provider_cancellation');
    perform app.reopen_job(j.id);
    perform app.notify_party(e.organisation_id, j.posted_by, 'marketplace_engagement', 'Provider cancelled: ' || j.title,
      'The job is open again: accept another proposal or invite providers.', 'marketplace/' || j.id);
  else
    update public.marketplace_jobs set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason) where id = j.id;
    perform app.notify_party(e.provider_id, null, 'marketplace_engagement', 'Customer cancelled: ' || j.title, btrim(p_reason), 'engagements/' || e.id);
  end if;
end $$;
revoke execute on function public.cancel_marketplace_engagement(uuid, text, text) from public, anon;
grant execute on function public.cancel_marketplace_engagement(uuid, text, text) to authenticated, service_role;

-- No-show (MKT-12): urgent 60 min past the committed arrival without checking in; standard 2 h past the start.
create or replace function public.report_no_show(p_engagement_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype := app.lock_engagement(p_engagement_id);
  j public.marketplace_jobs%rowtype;
  v public.marketplace_proposal_versions%rowtype;
  v_due timestamptz;
  v_case uuid;
begin
  if app.engagement_side(e) is distinct from 'poster' then perform app.raise('forbidden', 'The customer reports a no-show'); end if;
  if e.status not in ('confirmed', 'on_my_way') or e.on_site_at is not null then perform app.raise('invalid_status', 'A no-show can''t be reported now'); end if;
  select * into j from public.marketplace_jobs where id = e.job_id;
  select * into v from public.marketplace_proposal_versions where id = e.proposal_version_id;
  if j.urgency = 'urgent' then
    v_due := coalesce(e.eta_at, e.accepted_at + make_interval(mins => coalesce(v.arrival_minutes, 60)))
             + make_interval(mins => coalesce(app.setting_int('marketplace.no_show_urgent_minutes'), 60));
  else
    v_due := coalesce(e.scheduled_start, (v.available_from::timestamp + time '07:00') at time zone 'Australia/Brisbane')
             + make_interval(mins => coalesce(app.setting_int('marketplace.no_show_standard_minutes'), 120));
  end if;
  if v_due is null or now() < v_due then
    perform app.raise('too_early', format('A no-show can be reported from %s', to_char(v_due at time zone 'Australia/Brisbane', 'DD/MM/YYYY HH24:MI')));
  end if;
  update public.marketplace_engagements set status = 'no_show_reported' where id = e.id;
  insert into public.marketplace_cases (engagement_id, provider_id, raised_by_side, category, description, respond_by)
  values (e.id, e.provider_id, 'poster', 'no_show', coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'The provider did not arrive.'),
          now() + make_interval(hours => coalesce(app.setting_int('marketplace.case_response_hours'), 48)))
  returning id into v_case;
  insert into public.marketplace_case_events (case_id, event, note) values (v_case, 'raised', p_note);
  perform app.notify_party(e.provider_id, null, 'marketplace_case', 'No-show reported: ' || j.title, 'Respond within 48 hours before HVEMS decides.', 'engagements/' || e.id);
  return v_case;
end $$;
revoke execute on function public.report_no_show(uuid, text) from public, anon;
grant execute on function public.report_no_show(uuid, text) to authenticated, service_role;

create or replace function public.raise_marketplace_case(p_engagement_id uuid, p_category text, p_description text, p_evidence text[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.marketplace_engagements%rowtype;
  v_side text;
  v_id uuid;
begin
  select * into e from public.marketplace_engagements where id = p_engagement_id;
  if e.id is null then perform app.raise('not_found', 'Engagement not found'); end if;
  v_side := app.engagement_side(e);
  if v_side is null then perform app.raise('forbidden', 'You are not part of this engagement'); end if;
  if p_category not in ('conduct', 'safety', 'fee', 'other') then perform app.raise('invalid_category', 'Choose what the case is about'); end if;
  insert into public.marketplace_cases (engagement_id, provider_id, raised_by_side, category, description, evidence_paths, respond_by)
  values (e.id, e.provider_id, v_side, p_category, btrim(p_description), coalesce(p_evidence, '{}'),
          now() + make_interval(hours => coalesce(app.setting_int('marketplace.case_response_hours'), 48)))
  returning id into v_id;
  insert into public.marketplace_case_events (case_id, event, note) values (v_id, 'raised', btrim(p_description));
  if v_side = 'poster' then
    perform app.notify_party(e.provider_id, null, 'marketplace_case', 'A case was raised', btrim(p_description), 'engagements/' || e.id);
  else
    perform app.notify_party(e.organisation_id, null, 'marketplace_case', 'A case was raised', btrim(p_description), 'marketplace/' || e.job_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.raise_marketplace_case(uuid, text, text, text[]) from public, anon;
grant execute on function public.raise_marketplace_case(uuid, text, text, text[]) to authenticated, service_role;

create or replace function public.respond_marketplace_case(p_case_id uuid, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.marketplace_cases%rowtype;
  e public.marketplace_engagements%rowtype;
  v_side text;
begin
  select * into c from public.marketplace_cases where id = p_case_id for update;
  if c.id is null or c.engagement_id is null then perform app.raise('not_found', 'Case not found'); end if;
  select * into e from public.marketplace_engagements where id = c.engagement_id;
  v_side := app.engagement_side(e);
  if v_side is null or v_side = c.raised_by_side then perform app.raise('forbidden', 'The other party responds to a case'); end if;
  if c.status <> 'awaiting_response' then perform app.raise('invalid_status', 'This case is no longer waiting for a response'); end if;
  if char_length(btrim(coalesce(p_response, ''))) < 3 then perform app.raise('response_required', 'Write your response'); end if;
  update public.marketplace_cases set response = btrim(p_response), responded_at = now(), status = 'under_review' where id = c.id;
  insert into public.marketplace_case_events (case_id, event, note) values (c.id, 'responded', btrim(p_response));
end $$;
revoke execute on function public.respond_marketplace_case(uuid, text) from public, anon;
grant execute on function public.respond_marketplace_case(uuid, text) to authenticated, service_role;

-- HVEMS decides conduct, safety and fee cases; an upheld no-show is a strike and reopens the job.
-- Work-quality and job-payment disputes are between the parties (SoW 4.8).
create or replace function public.decide_marketplace_case(p_case_id uuid, p_upheld boolean, p_outcome text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.marketplace_cases%rowtype;
  e public.marketplace_engagements%rowtype;
begin
  if not app.is_platform_staff() then perform app.raise('forbidden', 'HVEMS support decides cases'); end if;
  select * into c from public.marketplace_cases where id = p_case_id for update;
  if c.id is null then perform app.raise('not_found', 'Case not found'); end if;
  if c.status in ('decided', 'closed') then perform app.raise('invalid_status', 'This case has been decided'); end if;
  if char_length(btrim(coalesce(p_outcome, ''))) < 3 then perform app.raise('outcome_required', 'Record the outcome'); end if;
  if c.category = 'no_show' and c.status = 'awaiting_response' and c.respond_by > now() then
    perform app.raise('awaiting_response', 'The provider has until ' || to_char(c.respond_by at time zone 'Australia/Brisbane', 'DD/MM/YYYY HH24:MI') || ' to respond');
  end if;
  update public.marketplace_cases set status = 'decided', upheld = p_upheld, outcome = btrim(p_outcome), decided_by = auth.uid(), decided_at = now(),
    owner_id = coalesce(owner_id, auth.uid()) where id = c.id;
  insert into public.marketplace_case_events (case_id, event, note) values (c.id, case when p_upheld then 'upheld' else 'not_upheld' end, btrim(p_outcome));
  if c.category = 'no_show' and c.engagement_id is not null then
    e := app.lock_engagement(c.engagement_id);
    if p_upheld then
      update public.marketplace_engagements set status = 'cancelled', cancelled_at = now(), cancelled_by_side = 'hvems', cancel_category = 'no_show',
        cancel_reason = btrim(p_outcome) where id = e.id;
      perform app.add_strike(e.provider_id, e.id, 'no_show');
      perform app.reopen_job(e.job_id);
    elsif e.status = 'no_show_reported' then
      update public.marketplace_engagements set status = case when e.on_my_way_at is not null then 'on_my_way' else 'confirmed' end where id = e.id;
    end if;
  end if;
end $$;
revoke execute on function public.decide_marketplace_case(uuid, boolean, text) from public, anon;
grant execute on function public.decide_marketplace_case(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reviews (MKT-17) and reliability (MKT-23)
-- ---------------------------------------------------------------------------
create table public.engagement_reviews (
  engagement_id uuid primary key references public.marketplace_engagements (id) on delete cascade,
  provider_id uuid not null references public.organisations (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_by uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  reply text check (reply is null or char_length(reply) <= 2000),
  replied_at timestamptz,
  removed_at timestamptz,
  removed_reason text,
  removed_by uuid references auth.users (id) on delete set null
);
create index engagement_reviews_provider_idx on public.engagement_reviews (provider_id);
create index engagement_reviews_created_by_idx on public.engagement_reviews (created_by);
create index engagement_reviews_removed_by_idx on public.engagement_reviews (removed_by);
create trigger audit_engagement_reviews after insert or update or delete on public.engagement_reviews
  for each row execute function app.audit_row_change('provider_id');
alter table public.engagement_reviews enable row level security;
revoke all on public.engagement_reviews from anon, authenticated;
grant select on public.engagement_reviews to authenticated;
-- Reviews are public to signed-in users, except removed ones (kept for audit, staff only).
create policy engagement_reviews_read on public.engagement_reviews for select to authenticated using (removed_at is null or (select app.is_platform_staff()));

create or replace function public.review_engagement(p_engagement_id uuid, p_rating integer, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.marketplace_engagements%rowtype;
begin
  select * into e from public.marketplace_engagements where id = p_engagement_id;
  if e.id is null then perform app.raise('not_found', 'Engagement not found'); end if;
  if app.engagement_side(e) is distinct from 'poster' then perform app.raise('forbidden', 'The customer reviews the provider'); end if;
  if e.status not in ('confirmed_complete', 'completed_unconfirmed') then perform app.raise('not_reviewable', 'Only completed engagements can be reviewed'); end if;
  if e.completed_at < now() - make_interval(days => coalesce(app.setting_int('marketplace.review_window_days'), 14)) then
    perform app.raise('review_window_closed', 'Reviews can be left within 14 days of completion');
  end if;
  if exists (select 1 from public.engagement_reviews r where r.engagement_id = e.id) then perform app.raise('already_reviewed', 'One review per engagement'); end if;
  if p_rating is null or p_rating not between 1 and 5 then perform app.raise('rating_required', 'Choose 1 to 5 stars'); end if;
  insert into public.engagement_reviews (engagement_id, provider_id, rating, comment) values (e.id, e.provider_id, p_rating, nullif(btrim(coalesce(p_comment, '')), ''));
end $$;
revoke execute on function public.review_engagement(uuid, integer, text) from public, anon;
grant execute on function public.review_engagement(uuid, integer, text) to authenticated, service_role;

create or replace function public.reply_to_review(p_engagement_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.engagement_reviews%rowtype;
begin
  select * into r from public.engagement_reviews where engagement_id = p_engagement_id for update;
  if r.engagement_id is null then perform app.raise('not_found', 'Review not found'); end if;
  perform app.require_capability(r.provider_id, 'provider.engagements.manage');
  if r.reply is not null then perform app.raise('already_replied', 'You can reply once'); end if;
  if char_length(btrim(coalesce(p_reply, ''))) < 2 then perform app.raise('reply_required', 'Write your reply'); end if;
  update public.engagement_reviews set reply = btrim(p_reply), replied_at = now() where engagement_id = r.engagement_id;
end $$;
revoke execute on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated, service_role;

create or replace function public.remove_review(p_engagement_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_staff() then perform app.raise('forbidden', 'HVEMS removes reviews'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give the reason'); end if;
  update public.engagement_reviews set removed_at = now(), removed_reason = btrim(p_reason), removed_by = auth.uid()
  where engagement_id = p_engagement_id and removed_at is null;
end $$;
revoke execute on function public.remove_review(uuid, text) from public, anon;
grant execute on function public.remove_review(uuid, text) to authenticated, service_role;

-- Rating (shown after 3 reviews) and reliability figures for posters comparing proposals.
create or replace function app.provider_reliability(p_provider uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'reviews', (select count(*) from public.engagement_reviews r where r.provider_id = p_provider and r.removed_at is null),
    'rating', (select case when count(*) >= 3 then round(avg(r.rating)::numeric, 1) end from public.engagement_reviews r where r.provider_id = p_provider and r.removed_at is null),
    'completed', (select count(*) from public.marketplace_engagements e where e.provider_id = p_provider and e.status in ('confirmed_complete', 'completed_unconfirmed')),
    'cancellation_rate', (select case when count(*) > 0 then round(100.0 * count(*) filter (where e.cancelled_by_side = 'provider') / count(*)) end
                          from public.marketplace_engagements e where e.provider_id = p_provider),
    'no_shows_90d', (select count(*) from public.provider_strikes s where s.provider_id = p_provider and s.reason = 'no_show' and s.created_at > now() - interval '90 days'),
    'median_response_minutes', (select round(percentile_cont(0.5) within group (order by extract(epoch from (p.submitted_at - j.posted_at)) / 60))
                                from public.marketplace_proposals p join public.marketplace_jobs j on j.id = p.job_id where p.provider_id = p_provider))
$$;
grant execute on function app.provider_reliability(uuid) to authenticated, service_role;

-- Proposals for the poster now include rating and reliability (MKT-10, MKT-23).
create or replace function public.list_job_proposals(p_job_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j public.marketplace_jobs%rowtype;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  if not (app.has_capability(j.organisation_id, 'marketplace.post') or app.has_capability(j.organisation_id, 'marketplace.accept')
          or app.has_capability(j.organisation_id, 'work_orders.manage')) then
    perform app.raise('forbidden', 'You can''t see proposals on this job');
  end if;
  return query
  select jsonb_build_object(
    'id', p.id, 'status', case when p.status = 'active' and p.valid_until <= now() then 'expired' else p.status end,
    'version', p.version, 'valid_until', p.valid_until, 'submitted_at', p.submitted_at, 'updated_at', p.updated_at,
    'provider', jsonb_build_object('id', o.id, 'name', o.name, 'mobile_service', pp.mobile_service,
      'categories', pp.categories,
      'regions', (select coalesce(jsonb_agg(r.name order by r.sort_order), '[]') from public.marketplace_regions r where r.code = any (pp.region_codes)),
      'badges', (select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'details', b.details, 'checked_at', b.checked_at, 'expires_on', b.expires_on)), '[]')
                 from public.provider_badges b where b.organisation_id = o.id and b.revoked_at is null),
      'reliability', app.provider_reliability(o.id)),
    'conflict', app.marketplace_conflict(o.id, j.organisation_id),
    'terms', to_jsonb(v) - 'proposal_id' - 'created_by',
    'versions', (select count(*) from public.marketplace_proposal_versions x where x.proposal_id = p.id))
  from public.marketplace_proposals p
  join public.organisations o on o.id = p.provider_id
  left join public.provider_profiles pp on pp.organisation_id = o.id
  join public.marketplace_proposal_versions v on v.proposal_id = p.id and v.version = p.version
  where p.job_id = j.id
  order by (p.status = 'active' and p.valid_until > now()) desc, p.updated_at desc;
end $$;

-- After 7 days without confirmation: "Completed – not confirmed" (MKT-15).
create or replace function app.sweep_engagements() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.marketplace_engagements set status = 'completed_unconfirmed'
  where status = 'completed' and completed_at < now() - make_interval(days => coalesce(app.setting_int('marketplace.completion_confirm_days'), 7));
  get diagnostics v_n = row_count;
  update public.marketplace_jobs j set status = 'closed'
  where j.status = 'engaged' and exists (select 1 from public.marketplace_engagements e where e.job_id = j.id and e.status = 'completed_unconfirmed');
  return v_n;
end $$;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hvems-marketplace-engagements', '20 * * * *', 'select app.sweep_engagements()');
  end if;
end $do$;

-- Completion photos and invoices: <provider organisation>/<file> in marketplace-files.
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    execute $p$
      create policy marketplace_files_provider_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'marketplace-files' and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('provider.engagements.work'))::text[])
      )$p$;
    -- The poster sees files the engaged provider attached to its engagements.
    execute $p$
      create policy marketplace_files_engagement_view on storage.objects for select to authenticated using (
        bucket_id = 'marketplace-files'
        and exists (select 1 from public.marketplace_engagements e where name = any (e.completion_paths)
                    and (e.organisation_id = any ((select app.orgs_with_capability('org.view'))::uuid[]))))
      $p$;
    -- The engaged provider sees all the job's files after confirmation (MKT-11).
    execute $p$
      create policy marketplace_files_engaged_provider_view on storage.objects for select to authenticated using (
        bucket_id = 'marketplace-files'
        and exists (select 1 from public.marketplace_job_files f join public.marketplace_engagements e on e.job_id = f.job_id
                    where f.path = name and e.status <> 'cancelled'
                      and e.provider_id = any ((select app.orgs_with_capability('org.view'))::uuid[])))
      $p$;
  end if;
end $do$;
