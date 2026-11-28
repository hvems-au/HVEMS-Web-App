-- =============================================================================
-- Billing slice 3: connection fees on acceptance and monthly company waivers
-- (SoW 4.5, 5.4, 5.5; CS-29, CS-36, CS-37; ADR-006).
-- * While marketplace.connection_fees_live is false (until A-02) acceptance works as
--   before and nothing is charged. When it is on, accepting a proposal starts a
--   connection-fee attempt instead of confirming straight away:
--     1. begin_fee_acceptance (the person accepting): the same checks as accepting,
--        reserves a company waiver if one is available, one attempt per job at a time;
--     2. the web server places a hold (authorisation, nothing charged) on the poster's
--        card, unless a waiver covers it, then on the provider's;
--     3. both held: begin_fee_capture re-checks the job, the server captures both, and
--        complete_fee_acceptance confirms the engagement (fee_status 'collected');
--     4. the poster's hold fails: nothing is charged, the waiver is released;
--     5. the provider's hold fails: "Acceptance pending fees" for 4 hours (standard) or
--        30 minutes (urgent); the provider can update the card and pay; when the window
--        lapses or the poster cancels, the poster's hold is released.
-- * Releasing holds and refunding happen in the web server (needs_stripe_cleanup);
--   the database never loses track of a hold.
-- * Company waivers: floor(assets current for 14+ days ÷ 10) each Brisbane month,
--   topped up during the month as the count grows, never reduced; unused ones lapse
--   at the end of the month. A reserved waiver returns when the attempt fails.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Company waivers (SoW 5.5)
-- ---------------------------------------------------------------------------
create table public.company_waivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status text not null default 'available' check (status in ('available', 'reserved', 'used')),
  attempt_id uuid,
  engagement_id uuid references public.marketplace_engagements (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_waivers_org_month_idx on public.company_waivers (organisation_id, month, status);
create index company_waivers_engagement_idx on public.company_waivers (engagement_id);
alter table public.company_waivers enable row level security;
revoke all on public.company_waivers from anon, authenticated;
grant select on public.company_waivers to authenticated;
create policy company_waivers_read on public.company_waivers for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('marketplace.accept'))::uuid[])
  or (select app.is_platform_staff()));

create or replace function app.waiver_month() returns date
language sql stable set search_path = '' as $$ select date_trunc('month', now() at time zone 'Australia/Brisbane')::date $$;

-- Add this month's waivers up to floor(qualifying assets ÷ assets per waiver). Never reduces.
create or replace function app.top_up_company_waivers(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_per integer := greatest(coalesce(app.setting_int('waivers.assets_per_waiver'), 10), 1);
  v_days integer := coalesce(app.setting_int('waivers.qualifying_days'), 14);
  v_month date := app.waiver_month();
  v_qualifying integer;
  v_issued integer;
  v_add integer;
begin
  if (select kind from public.organisations where id = p_org) <> 'company' then return 0; end if;
  -- One top-up at a time per organisation.
  perform pg_advisory_xact_lock(hashtext('company_waivers:' || p_org::text));
  select count(*) into v_qualifying from public.assets
  where organisation_id = p_org and archived_at is null and created_at <= now() - make_interval(days => v_days);
  select count(*) into v_issued from public.company_waivers where organisation_id = p_org and month = v_month;
  v_add := greatest(v_qualifying / v_per - v_issued, 0);
  if v_add > 0 then
    insert into public.company_waivers (organisation_id, month) select p_org, v_month from generate_series(1, v_add);
  end if;
  return v_add;
end $$;
revoke execute on function app.top_up_company_waivers(uuid) from public, anon, authenticated;

-- This month's waivers for the Billing page and the accept dialog.
create or replace function public.company_waiver_balance(p_organisation_id uuid)
returns table (available integer, used integer, reserved integer, allowance integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.has_capability(p_organisation_id, 'org.billing.view') or app.has_capability(p_organisation_id, 'marketplace.accept')) then
    perform app.raise('forbidden', 'You can''t see this organisation''s waivers');
  end if;
  perform app.top_up_company_waivers(p_organisation_id);
  return query
  select count(*) filter (where status = 'available')::integer, count(*) filter (where status = 'used')::integer,
         count(*) filter (where status = 'reserved')::integer, count(*)::integer
  from public.company_waivers where organisation_id = p_organisation_id and month = app.waiver_month();
end $$;
revoke execute on function public.company_waiver_balance(uuid) from public, anon;
grant execute on function public.company_waiver_balance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Connection-fee attempts (ADR-006)
-- ---------------------------------------------------------------------------
create table public.connection_fee_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.marketplace_jobs (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  provider_id uuid not null references public.organisations (id) on delete cascade,
  proposal_id uuid not null references public.marketplace_proposals (id) on delete cascade,
  proposal_version_id uuid not null references public.marketplace_proposal_versions (id),
  urgency text not null check (urgency in ('standard', 'urgent')),
  poster_fee_cents bigint not null check (poster_fee_cents >= 0),
  provider_fee_cents bigint not null check (provider_fee_cents >= 0),
  waiver_id uuid references public.company_waivers (id) on delete set null,
  state text not null default 'authorising'
    check (state in ('authorising', 'pending_provider', 'capturing', 'confirmed', 'failed_poster', 'expired', 'cancelled', 'failed')),
  poster_status text not null default 'none'
    check (poster_status in ('none', 'waived', 'authorised', 'failed', 'captured', 'released', 'refunded')),
  provider_status text not null default 'none'
    check (provider_status in ('none', 'authorised', 'failed', 'captured', 'released', 'refunded')),
  poster_payment_intent text check (poster_payment_intent is null or poster_payment_intent ~ '^pi_[A-Za-z0-9]+$'),
  provider_payment_intent text check (provider_payment_intent is null or provider_payment_intent ~ '^pi_[A-Za-z0-9]+$'),
  provider_tries integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  pending_until timestamptz,
  needs_stripe_cleanup boolean not null default false,
  engagement_id uuid references public.marketplace_engagements (id) on delete set null,
  accepted_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One acceptance in progress per job: two people accepting at once start one attempt.
create unique index connection_fee_attempts_one_active on public.connection_fee_attempts (job_id)
  where state in ('authorising', 'pending_provider', 'capturing');
create index connection_fee_attempts_org_idx on public.connection_fee_attempts (organisation_id, created_at desc);
create index connection_fee_attempts_provider_idx on public.connection_fee_attempts (provider_id, created_at desc);
create index connection_fee_attempts_proposal_idx on public.connection_fee_attempts (proposal_id);
create index connection_fee_attempts_version_idx on public.connection_fee_attempts (proposal_version_id);
create index connection_fee_attempts_waiver_idx on public.connection_fee_attempts (waiver_id);
create index connection_fee_attempts_engagement_idx on public.connection_fee_attempts (engagement_id);
create index connection_fee_attempts_accepted_by_idx on public.connection_fee_attempts (accepted_by);
create index connection_fee_attempts_cleanup_idx on public.connection_fee_attempts (needs_stripe_cleanup) where needs_stripe_cleanup;
create index connection_fee_attempts_pending_idx on public.connection_fee_attempts (pending_until) where state = 'pending_provider';
create trigger audit_connection_fee_attempts after insert or update on public.connection_fee_attempts
  for each row execute function app.audit_row_change('organisation_id');
alter table public.connection_fee_attempts enable row level security;
revoke all on public.connection_fee_attempts from anon, authenticated;
grant select on public.connection_fee_attempts to authenticated;
create policy connection_fee_attempts_read on public.connection_fee_attempts for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('marketplace.accept'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('marketplace.post'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])
  or provider_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
  or (select app.is_platform_staff()));
alter table public.company_waivers add constraint company_waivers_attempt_fk
  foreign key (attempt_id) references public.connection_fee_attempts (id) on delete set null;
create index company_waivers_attempt_idx on public.company_waivers (attempt_id);

create or replace function app.fee_attempt_active(s text) returns boolean
language sql immutable set search_path = '' as $$ select s in ('authorising', 'pending_provider', 'capturing') $$;

create or replace function app.release_waiver(p_attempt uuid) returns void
language sql security definer set search_path = '' as $$
  update public.company_waivers set status = 'available', attempt_id = null, updated_at = now()
  where attempt_id = p_attempt and status = 'reserved'
$$;
revoke execute on function app.release_waiver(uuid) from public, anon, authenticated;

-- A job or proposal can't be closed while its acceptance is waiting on fees.
create or replace function app.guard_pending_acceptance() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'marketplace_jobs' then
    if old.status = 'open' and new.status not in ('open', 'engaged')
       and exists (select 1 from public.connection_fee_attempts a where a.job_id = new.id and app.fee_attempt_active(a.state)) then
      perform app.raise('acceptance_pending', 'An acceptance is waiting on connection fees. Cancel it first.');
    end if;
  elsif old.status = 'active' and new.status not in ('active', 'accepted')
        and exists (select 1 from public.connection_fee_attempts a where a.proposal_id = new.id and app.fee_attempt_active(a.state)) then
    perform app.raise('acceptance_pending', 'This proposal is being accepted and is waiting on connection fees.');
  end if;
  return new;
end $$;
create trigger marketplace_jobs_guard_pending before update of status on public.marketplace_jobs
  for each row execute function app.guard_pending_acceptance();
create trigger marketplace_proposals_guard_pending before update of status on public.marketplace_proposals
  for each row execute function app.guard_pending_acceptance();

-- Expiry leaves alone a job and proposal whose acceptance is waiting on fees.
create or replace function app.expire_marketplace() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_a integer; v_b integer;
begin
  update public.marketplace_jobs j set status = 'expired' where j.status = 'open' and j.closes_at <= now()
    and not exists (select 1 from public.connection_fee_attempts a where a.job_id = j.id and app.fee_attempt_active(a.state));
  get diagnostics v_a = row_count;
  update public.marketplace_proposals p set status = 'expired', updated_at = now() where p.status = 'active' and p.valid_until <= now()
    and not exists (select 1 from public.connection_fee_attempts a where a.proposal_id = p.id and app.fee_attempt_active(a.state));
  get diagnostics v_b = row_count;
  return v_a + v_b;
end $$;

-- ---------------------------------------------------------------------------
-- Creating the engagement (shared by direct acceptance and paid acceptance)
-- ---------------------------------------------------------------------------
create or replace function app.create_engagement(
  p_job_id uuid, p_proposal_id uuid, p_version_id uuid, p_poster_fee bigint, p_provider_fee bigint,
  p_fee_status text, p_follow_up_of uuid, p_accepted_by uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  pr public.marketplace_proposals%rowtype;
  v_id uuid;
  v_provider_name text;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  select * into pr from public.marketplace_proposals where id = p_proposal_id;
  insert into public.marketplace_engagements (job_id, organisation_id, provider_id, proposal_id, proposal_version_id,
    poster_fee_cents, provider_fee_cents, fee_status, follow_up_of, accepted_by)
  values (j.id, j.organisation_id, pr.provider_id, pr.id, p_version_id, p_poster_fee, p_provider_fee, p_fee_status, p_follow_up_of, p_accepted_by)
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
  join public.org_memberships m on m.organisation_id = p.provider_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator')
  where p.job_id = j.id and p.status = 'not_selected' and p.id <> pr.id;
  return v_id;
end $$;
revoke execute on function app.create_engagement(uuid, uuid, uuid, bigint, bigint, text, uuid, uuid) from public, anon, authenticated;

-- The checks every acceptance makes (caller holds the job lock). Returns the accepted version.
create or replace function app.check_acceptable(p_job public.marketplace_jobs, p_proposal public.marketplace_proposals)
returns public.marketplace_proposal_versions
language plpgsql security definer set search_path = '' as $$
declare v public.marketplace_proposal_versions%rowtype;
begin
  if exists (select 1 from public.marketplace_engagements e where e.job_id = p_job.id and app.engagement_live(e.status)) then
    perform app.raise('already_engaged', 'This job already has an engagement');
  end if;
  if exists (select 1 from public.connection_fee_attempts a where a.job_id = p_job.id and app.fee_attempt_active(a.state)) then
    perform app.raise('acceptance_pending', 'An acceptance for this job is already waiting on connection fees');
  end if;
  if p_job.status <> 'open' then perform app.raise('job_closed', 'This job is not open'); end if;
  if p_proposal.job_id <> p_job.id or p_proposal.status <> 'active' or p_proposal.valid_until <= now() then
    perform app.raise('proposal_unavailable', 'This proposal has expired or been withdrawn');
  end if;
  if app.provider_proposal_block(p_proposal.provider_id) is not null then
    perform app.raise('provider_not_eligible', 'This provider can''t take the job right now');
  end if;
  select * into v from public.marketplace_proposal_versions where proposal_id = p_proposal.id and version = p_proposal.version;
  return v;
end $$;
revoke execute on function app.check_acceptable(public.marketplace_jobs, public.marketplace_proposals) from public, anon, authenticated;

-- Direct acceptance: follow-ups always; everything while connection fees are not live.
create or replace function public.accept_marketplace_proposal(p_proposal_id uuid, p_follow_up_of uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pr public.marketplace_proposals%rowtype;
  v public.marketplace_proposal_versions%rowtype;
  j public.marketplace_jobs%rowtype;
  f public.marketplace_engagements%rowtype;
  v_live boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'marketplace.connection_fees_live'), false);
  v_fee bigint;
begin
  select * into pr from public.marketplace_proposals where id = p_proposal_id;
  if pr.id is null then perform app.raise('not_found', 'Proposal not found'); end if;
  -- Lock the job: two people accepting at once are handled one after the other.
  select * into j from public.marketplace_jobs where id = pr.job_id for update;
  perform app.require_capability(j.organisation_id, 'marketplace.accept');
  select * into pr from public.marketplace_proposals where id = p_proposal_id for update;
  v := app.check_acceptable(j, pr);

  -- Follow-up with the same provider within 30 days: no connection fee for either party (SoW 4.7).
  if p_follow_up_of is not null then
    select * into f from public.marketplace_engagements where id = p_follow_up_of and organisation_id = j.organisation_id;
    if f.id is null or f.provider_id <> pr.provider_id or f.status not in ('confirmed_complete', 'completed_unconfirmed')
       or coalesce(f.completed_at, f.confirmed_at) < now() - make_interval(days => coalesce(app.setting_int('marketplace.follow_up_days'), 30)) then
      perform app.raise('not_a_follow_up', 'A follow-up must be with the same provider within 30 days of completion');
    end if;
    return app.create_engagement(j.id, pr.id, v.id, 0, 0, 'waived_follow_up', p_follow_up_of, auth.uid());
  end if;
  if v_live then
    -- The web server collects the fees first (begin_fee_acceptance).
    perform app.raise('fees_required', 'Connection fees are collected before the engagement is confirmed');
  end if;
  v_fee := v.fee_cents;
  return app.create_engagement(j.id, pr.id, v.id, v_fee, v_fee, 'not_live', null, auth.uid());
exception when unique_violation then
  perform app.raise('already_engaged', 'This job already has an engagement');
end $$;

-- ---------------------------------------------------------------------------
-- Paid acceptance
-- ---------------------------------------------------------------------------
create or replace function app.has_default_card(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billing_customers where organisation_id = p_org)
     and exists (select 1 from public.payment_methods where organisation_id = p_org and is_default and detached_at is null)
$$;
revoke execute on function app.has_default_card(uuid) from public, anon, authenticated;

-- Step 1 (the person accepting): checks, waiver reservation, one attempt per job.
create or replace function public.begin_fee_acceptance(p_proposal_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pr public.marketplace_proposals%rowtype;
  v public.marketplace_proposal_versions%rowtype;
  j public.marketplace_jobs%rowtype;
  v_waiver uuid;
  v_id uuid;
begin
  if not coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'marketplace.connection_fees_live'), false) then
    perform app.raise('fees_not_live', 'Connection fees are not switched on');
  end if;
  select * into pr from public.marketplace_proposals where id = p_proposal_id;
  if pr.id is null then perform app.raise('not_found', 'Proposal not found'); end if;
  select * into j from public.marketplace_jobs where id = pr.job_id for update;
  perform app.require_capability(j.organisation_id, 'marketplace.accept');
  select * into pr from public.marketplace_proposals where id = p_proposal_id for update;
  v := app.check_acceptable(j, pr);

  if (select kind from public.organisations where id = j.organisation_id) = 'company' then
    perform app.top_up_company_waivers(j.organisation_id);
    select id into v_waiver from public.company_waivers
    where organisation_id = j.organisation_id and month = app.waiver_month() and status = 'available'
    order by created_at limit 1 for update skip locked;
  end if;
  if v_waiver is null and not app.has_default_card(j.organisation_id) then
    perform app.raise('card_required', 'Add a card under Billing before accepting: your connection fee is charged to it');
  end if;

  insert into public.connection_fee_attempts (job_id, organisation_id, provider_id, proposal_id, proposal_version_id, urgency,
    poster_fee_cents, provider_fee_cents, waiver_id, poster_status, accepted_by)
  values (j.id, j.organisation_id, pr.provider_id, pr.id, v.id, j.urgency, v.fee_cents, v.fee_cents, v_waiver,
          case when v_waiver is null then 'none' else 'waived' end, auth.uid())
  returning id into v_id;
  if v_waiver is not null then
    update public.company_waivers set status = 'reserved', attempt_id = v_id, updated_at = now() where id = v_waiver;
  end if;
  return v_id;
exception when unique_violation then
  perform app.raise('acceptance_pending', 'An acceptance for this job is already waiting on connection fees');
end $$;
revoke execute on function public.begin_fee_acceptance(uuid) from public, anon;
grant execute on function public.begin_fee_acceptance(uuid) to authenticated;

-- What the server needs to place the holds (service role only).
create or replace function public.fee_attempt_for_charging(p_id uuid)
returns table (id uuid, state text, job_title text, job_number bigint, urgency text, organisation_id uuid, provider_id uuid,
               poster_fee_cents bigint, provider_fee_cents bigint, poster_status text, provider_status text,
               poster_payment_intent text, provider_payment_intent text, provider_tries integer,
               poster_customer text, poster_payment_method text, provider_customer text, provider_payment_method text)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  return query
  select a.id, a.state, j.title, j.number, a.urgency, a.organisation_id, a.provider_id, a.poster_fee_cents, a.provider_fee_cents,
         a.poster_status, a.provider_status, a.poster_payment_intent, a.provider_payment_intent, a.provider_tries,
         pc.stripe_customer_id,
         (select pm.stripe_payment_method_id from public.payment_methods pm where pm.organisation_id = a.organisation_id and pm.is_default and pm.detached_at is null limit 1),
         vc.stripe_customer_id,
         (select pm.stripe_payment_method_id from public.payment_methods pm where pm.organisation_id = a.provider_id and pm.is_default and pm.detached_at is null limit 1)
  from public.connection_fee_attempts a
  join public.marketplace_jobs j on j.id = a.job_id
  left join public.billing_customers pc on pc.organisation_id = a.organisation_id
  left join public.billing_customers vc on vc.organisation_id = a.provider_id
  where a.id = p_id;
end $$;

-- Step 2 outcome for one side. Returns the attempt's state afterwards.
create or replace function public.record_fee_authorisation(p_id uuid, p_side text, p_payment_intent text, p_ok boolean, p_error text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.connection_fee_attempts%rowtype;
  j public.marketplace_jobs%rowtype;
  v_minutes integer;
begin
  perform app.require_service_role();
  select * into a from public.connection_fee_attempts where id = p_id for update;
  if a.id is null then perform app.raise('not_found', 'Attempt not found'); end if;
  if not app.fee_attempt_active(a.state) then
    -- Too late (cancelled or lapsed): a hold placed now must be released.
    if p_ok then
      if p_side = 'poster' then update public.connection_fee_attempts set poster_status = 'authorised', poster_payment_intent = p_payment_intent, needs_stripe_cleanup = true, updated_at = now() where id = a.id;
      else update public.connection_fee_attempts set provider_status = 'authorised', provider_payment_intent = p_payment_intent, needs_stripe_cleanup = true, updated_at = now() where id = a.id;
      end if;
    end if;
    return a.state;
  end if;
  select * into j from public.marketplace_jobs where id = a.job_id;

  if p_side = 'poster' then
    if p_ok then
      update public.connection_fee_attempts set poster_status = 'authorised', poster_payment_intent = p_payment_intent, updated_at = now() where id = a.id;
      return a.state;
    end if;
    update public.connection_fee_attempts set poster_status = 'failed', poster_payment_intent = coalesce(p_payment_intent, poster_payment_intent),
      state = 'failed_poster', last_error = left(p_error, 1000), finished_at = now(), updated_at = now(),
      needs_stripe_cleanup = (provider_status = 'authorised')
    where id = a.id;
    perform app.release_waiver(a.id);
    return 'failed_poster';
  elsif p_side = 'provider' then
    if p_ok then
      update public.connection_fee_attempts set provider_status = 'authorised', provider_payment_intent = p_payment_intent, last_error = null, updated_at = now() where id = a.id;
      return a.state;
    end if;
    update public.connection_fee_attempts set provider_status = 'failed', provider_payment_intent = coalesce(p_payment_intent, provider_payment_intent),
      last_error = left(p_error, 1000), updated_at = now()
    where id = a.id;
    if a.state = 'authorising' then
      v_minutes := case when a.urgency = 'urgent' then coalesce(app.setting_int('marketplace.provider_payment_window_urgent_minutes'), 30)
                        else coalesce(app.setting_int('marketplace.provider_payment_window_standard_minutes'), 240) end;
      update public.connection_fee_attempts set state = 'pending_provider', pending_until = now() + make_interval(mins => v_minutes) where id = a.id;
      insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
      select a.provider_id, u, 'billing_payment_failed', 'Pay your connection fee to confirm: ' || j.title,
        format('The customer accepted your proposal, but your card was declined. Update your card and pay within %s, or the acceptance lapses.',
               case when v_minutes % 60 = 0 then (v_minutes / 60) || ' hours' else v_minutes || ' minutes' end),
        'jobs/' || j.id
      from (select distinct x from (select app.capability_holders(a.provider_id, 'org.billing.manage') x
                                    union select app.capability_holders(a.provider_id, 'provider.engagements.manage')) s) h(u);
      perform app.notify_party(a.organisation_id, a.accepted_by, 'marketplace_engagement', 'Acceptance pending fees: ' || j.title,
        'The provider''s connection fee didn''t go through. They have time to update their card; nothing is charged unless both fees succeed.',
        'marketplace/' || j.id);
      return 'pending_provider';
    end if;
    return a.state;
  end if;
  perform app.raise('invalid_side', 'Side must be poster or provider');
end $$;

-- Step 3a: re-check before capturing. Returns true to go ahead; false means the attempt was cancelled (holds released by the server).
create or replace function public.begin_fee_capture(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  a public.connection_fee_attempts%rowtype;
  j public.marketplace_jobs%rowtype;
  pr public.marketplace_proposals%rowtype;
begin
  perform app.require_service_role();
  select * into a from public.connection_fee_attempts where id = p_id for update;
  if a.id is null or not app.fee_attempt_active(a.state) then return false; end if;
  if a.poster_status not in ('authorised', 'waived') or a.provider_status <> 'authorised' then
    perform app.raise('not_authorised', 'Both connection fees must be held first');
  end if;
  select * into j from public.marketplace_jobs where id = a.job_id for update;
  select * into pr from public.marketplace_proposals where id = a.proposal_id;
  if j.status <> 'open' or pr.status <> 'active' or app.provider_proposal_block(a.provider_id) is not null
     or exists (select 1 from public.marketplace_engagements e where e.job_id = j.id and app.engagement_live(e.status)) then
    update public.connection_fee_attempts set state = 'cancelled', last_error = 'The job or proposal is no longer available',
      needs_stripe_cleanup = true, finished_at = now(), updated_at = now() where id = a.id;
    perform app.release_waiver(a.id);
    return false;
  end if;
  update public.connection_fee_attempts set state = 'capturing', updated_at = now() where id = a.id;
  return true;
end $$;

-- Step 3b: both captured. Confirms the engagement.
create or replace function public.complete_fee_acceptance(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.connection_fee_attempts%rowtype;
  v_id uuid;
begin
  perform app.require_service_role();
  select * into a from public.connection_fee_attempts where id = p_id for update;
  if a.id is null then perform app.raise('not_found', 'Attempt not found'); end if;
  if a.state = 'confirmed' then return a.engagement_id; end if;
  if a.state <> 'capturing' then perform app.raise('invalid_state', 'This acceptance is not being captured'); end if;
  perform 1 from public.marketplace_jobs where id = a.job_id for update;
  v_id := app.create_engagement(a.job_id, a.proposal_id, a.proposal_version_id,
    case when a.poster_status = 'waived' then 0 else a.poster_fee_cents end, a.provider_fee_cents, 'collected', null, a.accepted_by);
  update public.connection_fee_attempts set state = 'confirmed', engagement_id = v_id, finished_at = now(), updated_at = now(),
    poster_status = case when poster_status = 'waived' then 'waived' else 'captured' end, provider_status = 'captured'
  where id = a.id;
  update public.company_waivers set status = 'used', engagement_id = v_id, updated_at = now() where attempt_id = a.id;
  perform app.notify_party(a.organisation_id, a.accepted_by, 'marketplace_engagement', 'Engagement confirmed',
    'Both connection fees went through and the engagement is confirmed.', 'engagements/' || v_id);
  return v_id;
end $$;

-- A capture failed after the holds succeeded (rare): the server refunds or releases both.
create or replace function public.fail_fee_acceptance(p_id uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  update public.connection_fee_attempts set state = 'failed', last_error = left(p_error, 1000), needs_stripe_cleanup = true,
    finished_at = now(), updated_at = now()
  where id = p_id and state in ('authorising', 'capturing', 'pending_provider');
  perform app.release_waiver(p_id);
end $$;

-- The provider updated its card and tries again within the window. Returns the try number (for the idempotency key).
create or replace function public.retry_provider_fee(p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.connection_fee_attempts%rowtype;
begin
  select * into a from public.connection_fee_attempts where id = p_id for update;
  if a.id is null then perform app.raise('not_found', 'Not found'); end if;
  if not (app.has_capability(a.provider_id, 'org.billing.manage') or app.has_capability(a.provider_id, 'provider.engagements.manage')) then
    perform app.raise('forbidden', 'Only the provider''s billing contact or a manager can pay this fee');
  end if;
  if a.state <> 'pending_provider' or a.pending_until <= now() then
    perform app.raise('acceptance_lapsed', 'This acceptance is no longer waiting on your fee');
  end if;
  if not app.has_default_card(a.provider_id) then
    perform app.raise('card_required', 'Add a card under Billing first');
  end if;
  update public.connection_fee_attempts set provider_tries = provider_tries + 1, updated_at = now() where id = a.id
  returning provider_tries into a.provider_tries;
  return a.provider_tries;
end $$;
revoke execute on function public.retry_provider_fee(uuid) from public, anon;
grant execute on function public.retry_provider_fee(uuid) to authenticated;

-- The poster cancels an acceptance that is waiting on the provider's fee: nothing is charged.
create or replace function public.cancel_fee_acceptance(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.connection_fee_attempts%rowtype;
  v_title text;
begin
  select * into a from public.connection_fee_attempts where id = p_id for update;
  if a.id is null then perform app.raise('not_found', 'Not found'); end if;
  perform app.require_capability(a.organisation_id, 'marketplace.accept');
  if a.state <> 'pending_provider' then perform app.raise('invalid_state', 'Only an acceptance waiting on the provider''s fee can be cancelled'); end if;
  update public.connection_fee_attempts set state = 'cancelled', needs_stripe_cleanup = (poster_status = 'authorised'),
    finished_at = now(), updated_at = now() where id = a.id;
  perform app.release_waiver(a.id);
  select title into v_title from public.marketplace_jobs where id = a.job_id;
  perform app.notify_party(a.provider_id, null, 'marketplace_engagement', 'Acceptance cancelled: ' || v_title,
    'The customer cancelled the acceptance while your connection fee was outstanding. Nothing was charged.', 'jobs/' || a.job_id);
end $$;
revoke execute on function public.cancel_fee_acceptance(uuid) from public, anon;
grant execute on function public.cancel_fee_acceptance(uuid) to authenticated;

-- Every 5 minutes: lapse windows; give up on attempts stuck mid-way (the server releases or refunds their holds).
create or replace function app.sweep_fee_attempts() returns integer
language plpgsql security definer set search_path = '' as $$
declare a record; v_n integer := 0;
begin
  for a in select x.*, j.title from public.connection_fee_attempts x join public.marketplace_jobs j on j.id = x.job_id
           where x.state = 'pending_provider' and x.pending_until <= now() for update of x skip locked loop
    update public.connection_fee_attempts set state = 'expired', needs_stripe_cleanup = (poster_status = 'authorised'),
      finished_at = now(), updated_at = now() where id = a.id;
    perform app.release_waiver(a.id);
    perform app.notify_party(a.organisation_id, a.accepted_by, 'marketplace_engagement', 'Acceptance lapsed: ' || a.title,
      'The provider didn''t pay the connection fee in time. Nothing was charged and the job is open again.', 'marketplace/' || a.job_id);
    perform app.notify_party(a.provider_id, null, 'marketplace_engagement', 'Acceptance lapsed: ' || a.title,
      'Your connection fee wasn''t paid in time, so the acceptance lapsed. Nothing was charged.', 'jobs/' || a.job_id);
    v_n := v_n + 1;
  end loop;
  update public.connection_fee_attempts set state = 'failed', last_error = coalesce(last_error, 'Interrupted before it finished'),
    needs_stripe_cleanup = true, finished_at = now(), updated_at = now()
  where state in ('authorising', 'capturing') and updated_at < now() - interval '15 minutes';
  perform app.release_waiver(id) from public.connection_fee_attempts where state = 'failed' and finished_at > now() - interval '1 minute';
  return v_n;
end $$;
revoke execute on function app.sweep_fee_attempts() from public, anon, authenticated;

-- The server releases holds and refunds captured fees for finished attempts.
create or replace function public.claim_fee_cleanups(p_limit integer default 20)
returns table (id uuid, state text, poster_status text, provider_status text, poster_payment_intent text, provider_payment_intent text)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  return query
  select a.id, a.state, a.poster_status, a.provider_status, a.poster_payment_intent, a.provider_payment_intent
  from public.connection_fee_attempts a
  where a.needs_stripe_cleanup and not app.fee_attempt_active(a.state)
  order by a.updated_at limit greatest(1, least(coalesce(p_limit, 20), 100));
end $$;

create or replace function public.finish_fee_cleanup(p_id uuid, p_poster_status text, p_provider_status text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  update public.connection_fee_attempts set
    poster_status = coalesce(p_poster_status, poster_status),
    provider_status = coalesce(p_provider_status, provider_status),
    needs_stripe_cleanup = p_error is not null,
    last_error = coalesce(left(p_error, 1000), last_error),
    updated_at = now()
  where id = p_id;
end $$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.fee_attempt_for_charging(uuid)', 'public.record_fee_authorisation(uuid, text, text, boolean, text)',
    'public.begin_fee_capture(uuid)', 'public.complete_fee_acceptance(uuid)', 'public.fail_fee_acceptance(uuid, text)',
    'public.claim_fee_cleanups(integer)', 'public.finish_fee_cleanup(uuid, text, text, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $do$;

-- The billing dispatch also releases holds; kick it when there is cleanup to do.
create or replace function app.kick_billing_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.billing_invoices where status = 'draft')
     and not exists (select 1 from public.connection_fee_attempts where needs_stripe_cleanup and not app.fee_attempt_active(state)) then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') or not exists (select 1 from pg_namespace where nspname = 'vault') then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 55000)'
    using replace(v_url, '/api/email/dispatch', '/api/billing/dispatch'),
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
end $$;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hvems-fee-sweep', '*/5 * * * *', 'select app.sweep_fee_attempts(); select app.kick_billing_dispatch();');
  end if;
end $do$;
