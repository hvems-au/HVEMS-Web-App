-- =============================================================================
-- 2D Marketplace, part 2: jobs, invitations, questions and proposals
-- (SoW 4.2, 4.4, 4.6; spec MKT-04..09, MKT-20..22).
-- * Jobs: posted by the Owner or a Marketplace Buyer (company) or the Account
--   Owner / a Job Manager (marketplace-only). Every company job is linked to a work
--   order: an existing one, or one created for it. Only open regions take jobs.
--   Public: title, description, category, type, urgency, region and suburb, the
--   asset fields the poster shares, preferred dates, budget, shared attachments.
--   Private until an engagement (part 3): address, site access and safety notes,
--   unshared files, and the poster's name unless they choose to show it.
-- * Providers never read jobs directly: they browse and open them through
--   functions that return only the public fields (MKT-04: the preview equals the
--   provider view).
-- * Questions are private per provider. Before an engagement, phone numbers,
--   emails and links are masked for the recipient and flagged for HVEMS (MKT-08).
-- * Proposals: one per provider per job, every revision kept; firm until expiry or
--   withdrawal; the connection fee shown and consented to at submission (MKT-09).
-- * Acceptance, fees and engagements follow in part 3 (ADR-006, pending A-02).
-- =============================================================================

-- Company jobs posted without a work order get one of their own.
alter table public.work_orders drop constraint work_orders_kind_check;
alter table public.work_orders add constraint work_orders_kind_check check (kind in ('internal', 'vendor', 'marketplace'));

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.marketplace_jobs (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  work_order_id uuid,
  asset_id uuid,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  category text not null check (app.provider_categories_valid(array[category])),
  job_type text not null check (job_type in ('breakdown_repair', 'planned_service', 'inspection', 'other')),
  urgency text not null default 'standard' check (urgency in ('standard', 'urgent')),
  -- What providers see about the equipment (chosen fields, snapshotted at posting).
  shared_asset jsonb not null default '{}'::jsonb,
  region_code text not null references public.marketplace_regions (code),
  suburb text not null check (char_length(btrim(suburb)) between 2 and 80),
  postcode text check (postcode is null or postcode ~ '^\d{4}$'),
  -- Private until an engagement is confirmed.
  address text check (address is null or char_length(address) <= 300),
  site_access_notes text check (site_access_notes is null or char_length(site_access_notes) <= 2000),
  preferred_from date,
  preferred_to date,
  preferred_time text check (preferred_time is null or char_length(preferred_time) <= 120),
  budget_min_cents bigint check (budget_min_cents is null or budget_min_cents >= 0),
  budget_max_cents bigint check (budget_max_cents is null or budget_max_cents >= 0),
  required_badges text[] not null default '{}' check (required_badges <@ array['abn', 'public_liability', 'qualification']::text[]),
  show_poster_name boolean not null default false,
  invited_only boolean not null default false,
  status text not null default 'open' check (status in ('open', 'engaged', 'closed', 'cancelled', 'expired')),
  posted_by uuid not null references auth.users (id) default auth.uid(),
  posted_at timestamptz not null default now(),
  closes_at timestamptz not null,
  extended_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  clarification_sent_at timestamptz,
  unique (id, organisation_id),
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id),
  constraint marketplace_jobs_budget check (budget_min_cents is null or budget_max_cents is null or budget_min_cents <= budget_max_cents),
  constraint marketplace_jobs_window check (preferred_from is null or preferred_to is null or preferred_from <= preferred_to)
);
create index marketplace_jobs_org_idx on public.marketplace_jobs (organisation_id, posted_at desc);
create index marketplace_jobs_open_idx on public.marketplace_jobs (status, region_code, closes_at);
create index marketplace_jobs_wo_idx on public.marketplace_jobs (work_order_id, organisation_id);
create index marketplace_jobs_asset_idx on public.marketplace_jobs (asset_id, organisation_id);
create index marketplace_jobs_posted_by_idx on public.marketplace_jobs (posted_by);
create index marketplace_jobs_region_idx on public.marketplace_jobs (region_code);
create trigger audit_marketplace_jobs after insert or update or delete on public.marketplace_jobs
  for each row execute function app.audit_row_change('organisation_id');
alter table public.marketplace_jobs enable row level security;
revoke all on public.marketplace_jobs from anon, authenticated;
grant select on public.marketplace_jobs to authenticated;
-- The poster's people who post or accept, and HVEMS staff. Providers use the functions below.
create policy marketplace_jobs_read on public.marketplace_jobs for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('marketplace.post'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('marketplace.accept'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or (select app.is_platform_staff()));

create table public.marketplace_job_files (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  job_id uuid not null,
  path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  content_type text,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (job_id, organisation_id) references public.marketplace_jobs (id, organisation_id) on delete cascade
);
create index marketplace_job_files_job_idx on public.marketplace_job_files (job_id, organisation_id);
alter table public.marketplace_job_files enable row level security;
revoke all on public.marketplace_job_files from anon, authenticated;
grant select on public.marketplace_job_files to authenticated;
create policy marketplace_job_files_read on public.marketplace_job_files for select to authenticated using (
  exists (select 1 from public.marketplace_jobs j where j.id = marketplace_job_files.job_id));

create table public.marketplace_job_invites (
  job_id uuid not null references public.marketplace_jobs (id) on delete cascade,
  provider_id uuid not null references public.organisations (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  invited_at timestamptz not null default now(),
  primary key (job_id, provider_id)
);
create index marketplace_job_invites_provider_idx on public.marketplace_job_invites (provider_id);
create index marketplace_job_invites_invited_by_idx on public.marketplace_job_invites (invited_by);
alter table public.marketplace_job_invites enable row level security;
revoke all on public.marketplace_job_invites from anon, authenticated;
grant select on public.marketplace_job_invites to authenticated;
create policy marketplace_job_invites_read on public.marketplace_job_invites for select to authenticated using (
  provider_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
  or exists (select 1 from public.marketplace_jobs j where j.id = marketplace_job_invites.job_id));

create table public.marketplace_saved_jobs (
  provider_id uuid not null references public.organisations (id) on delete cascade,
  job_id uuid not null references public.marketplace_jobs (id) on delete cascade,
  saved_by uuid references auth.users (id) on delete set null default auth.uid(),
  saved_at timestamptz not null default now(),
  primary key (provider_id, job_id)
);
create index marketplace_saved_jobs_job_idx on public.marketplace_saved_jobs (job_id);
create index marketplace_saved_jobs_saved_by_idx on public.marketplace_saved_jobs (saved_by);
alter table public.marketplace_saved_jobs enable row level security;
revoke all on public.marketplace_saved_jobs from anon, authenticated;
grant select on public.marketplace_saved_jobs to authenticated;
create policy marketplace_saved_jobs_read on public.marketplace_saved_jobs for select to authenticated using (
  provider_id = any ((select app.orgs_with_capability('provider.jobs.browse'))::uuid[]));

-- Who may see a job as a provider: open, in an open region, and either public or invited.
create or replace function app.provider_can_see_job(p_provider uuid, j public.marketplace_jobs) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return (not j.invited_only or exists (select 1 from public.marketplace_job_invites i where i.job_id = j.id and i.provider_id = p_provider))
     -- After it closes, only providers who took part (proposed or asked) keep access.
     and (j.status = 'open' and j.closes_at > now()
          or exists (select 1 from public.marketplace_proposals p where p.job_id = j.id and p.provider_id = p_provider)
          or exists (select 1 from public.marketplace_messages m where m.job_id = j.id and m.provider_id = p_provider));
end $$;

-- The public view of a job (MKT-04: exactly what providers see).
create or replace function app.job_public(j public.marketplace_jobs) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'number', j.number, 'title', j.title, 'description', j.description, 'category', j.category,
    'job_type', j.job_type, 'urgency', j.urgency, 'shared_asset', j.shared_asset,
    'region_code', j.region_code, 'region', (select r.name from public.marketplace_regions r where r.code = j.region_code),
    'suburb', j.suburb, 'postcode', j.postcode,
    'preferred_from', j.preferred_from, 'preferred_to', j.preferred_to, 'preferred_time', j.preferred_time,
    'budget_min_cents', j.budget_min_cents, 'budget_max_cents', j.budget_max_cents, 'required_badges', j.required_badges,
    'invited_only', j.invited_only, 'status', case when j.status = 'open' and j.closes_at <= now() then 'expired' else j.status end,
    'posted_at', j.posted_at, 'closes_at', j.closes_at,
    'poster', case when j.show_poster_name then o.name
                   else case o.kind when 'company' then 'Fleet company' else 'Equipment owner' end end,
    'poster_kind', o.kind,
    'fee_cents', case when j.urgency = 'urgent' then app.setting_int('pricing.connection_fee_urgent_cents') else app.setting_int('pricing.connection_fee_standard_cents') end,
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'path', f.path) order by f.created_at)
                       from public.marketplace_job_files f where f.job_id = j.id and f.shared), '[]'::jsonb)
  )
  from public.organisations o where o.id = j.organisation_id
$$;

-- Post a job (MKT-04). p: title, description, category, job_type, urgency, region_code, suburb, postcode,
-- address, site_access_notes, preferred_from, preferred_to, preferred_time, budget_min_cents, budget_max_cents,
-- required_badges[], show_poster_name, invited_only, asset_id, work_order_id, share[] (asset fields),
-- asset_description {class, make, model, registration, description} for marketplace-only customers,
-- files [{path, file_name, content_type, shared}], invite[] (provider ids).
create or replace function public.post_marketplace_job(p_organisation_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.organisations%rowtype;
  a public.assets%rowtype;
  w public.work_orders%rowtype;
  v_region public.marketplace_regions%rowtype;
  v_id uuid;
  v_urgency text := coalesce(p ->> 'urgency', 'standard');
  v_share text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'share', '[]')) x), '{}');
  v_asset jsonb := '{}'::jsonb;
  v_wo uuid := nullif(p ->> 'work_order_id', '')::uuid;
  v_closes timestamptz;
  f jsonb;
  v_provider uuid;
  v_number integer;
begin
  perform app.require_capability(p_organisation_id, 'marketplace.post');
  select * into o from public.organisations where id = p_organisation_id;
  if o.kind = 'provider' then perform app.raise('forbidden', 'Providers don''t post jobs'); end if;
  select * into v_region from public.marketplace_regions where code = p ->> 'region_code';
  if v_region.code is null then perform app.raise('invalid_region', 'Choose the region'); end if;
  if not v_region.open then
    perform app.raise('region_not_open', 'The marketplace isn''t available in this region yet. You can register your interest.');
  end if;

  if o.kind = 'company' then
    if v_wo is not null then
      select * into w from public.work_orders where id = v_wo and organisation_id = p_organisation_id for update;
      if w.id is null then perform app.raise('not_found', 'Work order not found'); end if;
      if w.status in ('completed', 'closed', 'cancelled') then perform app.raise('invalid_status', 'Only an open work order can go to the marketplace'); end if;
      if exists (select 1 from public.marketplace_jobs j where j.work_order_id = w.id and j.status in ('open', 'engaged')) then
        perform app.raise('already_posted', 'This work order already has a marketplace job');
      end if;
      select * into a from public.assets where id = w.asset_id;
    else
      select * into a from public.assets where id = nullif(p ->> 'asset_id', '')::uuid and organisation_id = p_organisation_id;
      if a.id is null then perform app.raise('asset_required', 'Choose the equipment'); end if;
    end if;
    if a.archived_at is not null then perform app.raise('asset_archived', 'This equipment is archived'); end if;
    -- Only the fields the poster chose to share (MKT-04 step 2).
    v_asset := jsonb_strip_nulls(jsonb_build_object(
      'class', case when 'class' = any (v_share) then (select c.name from public.asset_classes c where c.id = a.asset_class_id) end,
      'make', case when 'make' = any (v_share) then a.make end,
      'model', case when 'model' = any (v_share) then a.model end,
      'year', case when 'year' = any (v_share) then a.year end,
      'registration', case when 'registration' = any (v_share) then a.registration_number end,
      'vin', case when 'vin' = any (v_share) then a.vin end,
      'serial_number', case when 'serial_number' = any (v_share) then a.serial_number end,
      'odometer_km', case when 'odometer_km' = any (v_share) then a.current_odometer_km end,
      'engine_hours', case when 'engine_hours' = any (v_share) then a.current_engine_hours end));
  else
    -- Marketplace-only customers describe the equipment.
    v_asset := jsonb_strip_nulls(jsonb_build_object(
      'class', nullif(btrim(coalesce(p -> 'asset_description' ->> 'class', '')), ''),
      'make', nullif(btrim(coalesce(p -> 'asset_description' ->> 'make', '')), ''),
      'model', nullif(btrim(coalesce(p -> 'asset_description' ->> 'model', '')), ''),
      'registration', nullif(btrim(coalesce(p -> 'asset_description' ->> 'registration', '')), ''),
      'description', nullif(btrim(coalesce(p -> 'asset_description' ->> 'description', '')), '')));
    if v_asset = '{}'::jsonb then perform app.raise('asset_required', 'Describe the vehicle or equipment'); end if;
  end if;

  v_closes := case when v_urgency = 'urgent' then now() + make_interval(hours => coalesce(app.setting_int('marketplace.urgent_open_hours'), 24))
                   else now() + make_interval(days => coalesce(app.setting_int('marketplace.standard_open_days'), 14)) end;

  -- A company job without a work order gets one, linked both ways.
  if o.kind = 'company' and w.id is null then
    select coalesce(max(number), 0) + 1 into v_number from public.work_orders where organisation_id = p_organisation_id;
    insert into public.work_orders (organisation_id, number, asset_id, title, description, kind, priority, created_by)
    values (p_organisation_id, v_number, a.id, btrim(p ->> 'title'), btrim(p ->> 'description'), 'marketplace',
            case when v_urgency = 'urgent' then 'urgent' else 'normal' end, auth.uid())
    returning * into w;
  end if;

  insert into public.marketplace_jobs (organisation_id, work_order_id, asset_id, title, description, category, job_type, urgency, shared_asset,
    region_code, suburb, postcode, address, site_access_notes, preferred_from, preferred_to, preferred_time, budget_min_cents, budget_max_cents,
    required_badges, show_poster_name, invited_only, closes_at)
  values (
    p_organisation_id, w.id, a.id, btrim(p ->> 'title'), btrim(p ->> 'description'), p ->> 'category', p ->> 'job_type', v_urgency, v_asset,
    v_region.code, btrim(p ->> 'suburb'), nullif(btrim(coalesce(p ->> 'postcode', '')), ''),
    nullif(btrim(coalesce(p ->> 'address', '')), ''), nullif(btrim(coalesce(p ->> 'site_access_notes', '')), ''),
    nullif(p ->> 'preferred_from', '')::date, nullif(p ->> 'preferred_to', '')::date, nullif(btrim(coalesce(p ->> 'preferred_time', '')), ''),
    nullif(p ->> 'budget_min_cents', '')::bigint, nullif(p ->> 'budget_max_cents', '')::bigint,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'required_badges', '[]')) x), '{}'),
    coalesce((p ->> 'show_poster_name')::boolean, false), coalesce((p ->> 'invited_only')::boolean, false), v_closes)
  returning id into v_id;

  for f in select * from jsonb_array_elements(coalesce(p -> 'files', '[]')) loop
    if left(f ->> 'path', 37) <> p_organisation_id::text || '/' or (f ->> 'path') like '%..%' then
      perform app.raise('invalid_path', 'An attachment was not uploaded for this organisation');
    end if;
    insert into public.marketplace_job_files (organisation_id, job_id, path, file_name, content_type, shared)
    values (p_organisation_id, v_id, f ->> 'path', f ->> 'file_name', f ->> 'content_type', coalesce((f ->> 'shared')::boolean, false));
  end loop;

  for v_provider in select x::uuid from jsonb_array_elements_text(coalesce(p -> 'invite', '[]')) x loop
    if not exists (select 1 from public.organisations where id = v_provider and kind = 'provider') then
      perform app.raise('invalid_provider', 'An invited provider was not found');
    end if;
    insert into public.marketplace_job_invites (job_id, provider_id) values (v_id, v_provider) on conflict do nothing;
  end loop;

  perform app.alert_providers_of_job(v_id);
  return v_id;
end $$;
revoke execute on function public.post_marketplace_job(uuid, jsonb) from public, anon;
grant execute on function public.post_marketplace_job(uuid, jsonb) to authenticated, service_role;

-- MKT-05/06: alert verified providers whose categories and regions match (urgent: only those accepting urgent jobs);
-- invited-only jobs alert just the invited providers. In-app now; email with notifications (NOT-09/10).
create or replace function app.alert_providers_of_job(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_n integer;
begin
  select * into j from public.marketplace_jobs where id = p_job;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select pp.organisation_id, m.user_id, 'marketplace_job',
         case when j.urgency = 'urgent' then 'URGENT job: ' else 'New job: ' end || j.title,
         format('%s · %s', j.suburb, (select r.name from public.marketplace_regions r where r.code = j.region_code)),
         'jobs/' || j.id
  from public.provider_profiles pp
  join public.org_memberships m on m.organisation_id = pp.organisation_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager')
  where app.provider_proposal_block(pp.organisation_id) is null
    and case when j.invited_only then exists (select 1 from public.marketplace_job_invites i where i.job_id = j.id and i.provider_id = pp.organisation_id)
             else j.category = any (pp.categories) and j.region_code = any (pp.region_codes)
                  and (j.urgency = 'standard' or pp.accepting_urgent)
                  and not ((now() at time zone 'Australia/Brisbane')::date = any (pp.unavailable_dates)) end;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Extend a standard job once (MKT-06), withdraw a job (costs nothing, MKT-22).
create or replace function public.extend_marketplace_job(p_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.marketplace_jobs%rowtype;
begin
  select * into j from public.marketplace_jobs where id = p_job_id for update;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'marketplace.post');
  if j.urgency = 'urgent' then perform app.raise('not_extendable', 'Urgent jobs can''t be extended'); end if;
  if j.extended_at is not null then perform app.raise('already_extended', 'A job can be extended once'); end if;
  if j.status not in ('open', 'expired') then perform app.raise('invalid_status', 'Only an open or expired job can be extended'); end if;
  update public.marketplace_jobs
  set status = 'open', extended_at = now(),
      closes_at = greatest(closes_at, now()) + make_interval(days => coalesce(app.setting_int('marketplace.standard_extension_days'), 14))
  where id = j.id;
end $$;
revoke execute on function public.extend_marketplace_job(uuid) from public, anon;
grant execute on function public.extend_marketplace_job(uuid) to authenticated, service_role;

create or replace function public.withdraw_marketplace_job(p_job_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.marketplace_jobs%rowtype;
begin
  select * into j from public.marketplace_jobs where id = p_job_id for update;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'marketplace.post');
  if j.status not in ('open', 'expired') then perform app.raise('invalid_status', 'Only an open job can be withdrawn'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give a reason'); end if;
  update public.marketplace_jobs set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason) where id = j.id;
  update public.marketplace_proposals set status = 'not_selected', updated_at = now() where job_id = j.id and status = 'active';
end $$;
revoke execute on function public.withdraw_marketplace_job(uuid, text) from public, anon;
grant execute on function public.withdraw_marketplace_job(uuid, text) to authenticated, service_role;

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
  select j.id, o.id from public.organisations o where o.id = any (p_provider_ids) and o.kind = 'provider'
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select o.id, m.user_id, 'marketplace_job', 'You''re invited to propose: ' || j.title, j.suburb, 'jobs/' || j.id
  from public.organisations o
  join public.org_memberships m on m.organisation_id = o.id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager')
  where o.id = any (p_provider_ids) and o.kind = 'provider';
  return v_n;
end $$;
revoke execute on function public.invite_providers(uuid, uuid[]) from public, anon;
grant execute on function public.invite_providers(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provider side: browse, open, save (MKT-06, MKT-07)
-- ---------------------------------------------------------------------------
create or replace function public.browse_marketplace_jobs(
  p_provider_id uuid,
  p_query text default null,
  p_category text default null,
  p_job_type text default null,
  p_urgency text default null,
  p_region text default null,
  p_saved_only boolean default false,
  p_mine boolean default false
) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_query, ''))), '');
begin
  perform app.require_capability(p_provider_id, 'provider.jobs.browse');
  return query
  select app.job_public(j) || jsonb_build_object(
           'saved', exists (select 1 from public.marketplace_saved_jobs s where s.provider_id = p_provider_id and s.job_id = j.id),
           'invited', exists (select 1 from public.marketplace_job_invites i where i.job_id = j.id and i.provider_id = p_provider_id),
           'my_proposal', (select p.status from public.marketplace_proposals p where p.job_id = j.id and p.provider_id = p_provider_id),
           'matches', coalesce((select j.category = any (pp.categories) and j.region_code = any (pp.region_codes)
                                from public.provider_profiles pp where pp.organisation_id = p_provider_id), false))
  from public.marketplace_jobs j
  join public.marketplace_regions r on r.code = j.region_code and r.open
  where app.provider_can_see_job(p_provider_id, j)
    and (v_q is null or lower(j.title || ' ' || j.description || ' ' || j.suburb) like '%' || v_q || '%')
    and (p_category is null or j.category = p_category)
    and (p_job_type is null or j.job_type = p_job_type)
    and (p_urgency is null or j.urgency = p_urgency)
    and (p_region is null or j.region_code = p_region)
    and (not coalesce(p_saved_only, false) or exists (select 1 from public.marketplace_saved_jobs s where s.provider_id = p_provider_id and s.job_id = j.id))
    and (not coalesce(p_mine, false) or exists (select 1 from public.marketplace_proposals p where p.job_id = j.id and p.provider_id = p_provider_id))
  order by (j.urgency = 'urgent') desc, j.posted_at desc
  limit 500;
end $$;
revoke execute on function public.browse_marketplace_jobs(uuid, text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.browse_marketplace_jobs(uuid, text, text, text, text, text, boolean, boolean) to authenticated, service_role;

create or replace function public.get_marketplace_job_for_provider(p_provider_id uuid, p_job_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j public.marketplace_jobs%rowtype;
begin
  perform app.require_capability(p_provider_id, 'provider.jobs.browse');
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null or not app.provider_can_see_job(p_provider_id, j) then
    perform app.raise('not_found', 'This job isn''t available');
  end if;
  return app.job_public(j) || jsonb_build_object(
    'saved', exists (select 1 from public.marketplace_saved_jobs s where s.provider_id = p_provider_id and s.job_id = j.id),
    'invited', exists (select 1 from public.marketplace_job_invites i where i.job_id = j.id and i.provider_id = p_provider_id),
    'block', app.provider_proposal_block(p_provider_id));
end $$;
revoke execute on function public.get_marketplace_job_for_provider(uuid, uuid) from public, anon;
grant execute on function public.get_marketplace_job_for_provider(uuid, uuid) to authenticated, service_role;

-- The poster's preview is the same function over the poster's own job (MKT-04 step 4).
create or replace function public.preview_marketplace_job(p_job_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j public.marketplace_jobs%rowtype;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'org.view');
  return app.job_public(j);
end $$;
revoke execute on function public.preview_marketplace_job(uuid) from public, anon;
grant execute on function public.preview_marketplace_job(uuid) to authenticated, service_role;

create or replace function public.save_marketplace_job(p_provider_id uuid, p_job_id uuid, p_saved boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_capability(p_provider_id, 'provider.jobs.browse');
  if p_saved then
    insert into public.marketplace_saved_jobs (provider_id, job_id) values (p_provider_id, p_job_id) on conflict do nothing;
  else
    delete from public.marketplace_saved_jobs where provider_id = p_provider_id and job_id = p_job_id;
  end if;
end $$;
revoke execute on function public.save_marketplace_job(uuid, uuid, boolean) from public, anon;
grant execute on function public.save_marketplace_job(uuid, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Questions and messages (MKT-08)
-- ---------------------------------------------------------------------------
create table public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.marketplace_jobs (id) on delete cascade,
  -- The thread: one per provider per job.
  provider_id uuid not null references public.organisations (id) on delete cascade,
  from_provider boolean not null,
  sender_id uuid not null references auth.users (id) default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  masked boolean not null default false,
  is_clarification boolean not null default false,
  created_at timestamptz not null default now()
);
create index marketplace_messages_thread_idx on public.marketplace_messages (job_id, provider_id, created_at);
create index marketplace_messages_provider_idx on public.marketplace_messages (provider_id);
create index marketplace_messages_sender_idx on public.marketplace_messages (sender_id);
alter table public.marketplace_messages enable row level security;
revoke all on public.marketplace_messages from anon, authenticated;
grant select on public.marketplace_messages to authenticated;
create policy marketplace_messages_read on public.marketplace_messages for select to authenticated using (
  provider_id = any ((select app.orgs_with_capability('provider.jobs.browse'))::uuid[])
  or exists (select 1 from public.marketplace_jobs j where j.id = marketplace_messages.job_id));

-- The unmasked text, for HVEMS moderation only.
create table public.marketplace_message_flags (
  message_id uuid primary key references public.marketplace_messages (id) on delete cascade,
  original_body text not null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);
create index marketplace_message_flags_reviewed_by_idx on public.marketplace_message_flags (reviewed_by);
alter table public.marketplace_message_flags enable row level security;
revoke all on public.marketplace_message_flags from anon, authenticated;
grant select on public.marketplace_message_flags to authenticated;
create policy marketplace_message_flags_read on public.marketplace_message_flags for select to authenticated using ((select app.is_platform_staff()));

-- Hide phone numbers, emails and links before an engagement.
create or replace function app.mask_contacts(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(p, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email hidden]', 'g'),
             '(https?://\S+|www\.\S+|\m[A-Za-z0-9-]+\.(com|net|org|au|io|co)(\.au)?(/\S*)?)', '[link hidden]', 'gi'),
           '(\+?61|\m0)[\s().-]*[2-478]([\s().-]*\d){8}', '[phone hidden]', 'g')
$$;

create or replace function app.post_message(p_job uuid, p_provider uuid, p_from_provider boolean, p_body text, p_clarification boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_masked text := app.mask_contacts(btrim(p_body));
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

create or replace function public.send_marketplace_message(p_job_id uuid, p_provider_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_from_provider boolean;
  v_id uuid;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then perform app.raise('message_required', 'Write a message'); end if;
  if app.has_capability(p_provider_id, 'provider.jobs.browse') then
    v_from_provider := true;
    if not app.provider_can_see_job(p_provider_id, j) then perform app.raise('not_found', 'This job isn''t available'); end if;
    if j.status <> 'open' then perform app.raise('invalid_status', 'This job is no longer open'); end if;
  elsif app.has_capability(j.organisation_id, 'marketplace.post') or app.has_capability(j.organisation_id, 'marketplace.accept') then
    v_from_provider := false;
    -- The poster replies in a thread a provider started (questions) or on a proposal.
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
         case when v_from_provider then 'New question on ' else 'Reply on ' end || j.title,
         left(app.mask_contacts(btrim(p_body)), 140),
         case when v_from_provider then 'marketplace/' || j.id else 'jobs/' || j.id end
  from public.org_memberships m
  where m.status = 'active'
    and ((v_from_provider and m.organisation_id = j.organisation_id and (m.user_id = j.posted_by or m.role in ('owner', 'account_owner')))
      or (not v_from_provider and m.organisation_id = p_provider_id and m.role in ('provider_owner', 'provider_manager')));
  return v_id;
end $$;
revoke execute on function public.send_marketplace_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_marketplace_message(uuid, uuid, text) to authenticated, service_role;

-- One clarification to everyone who asked or proposed (MKT-08).
create or replace function public.send_marketplace_clarification(p_job_id uuid, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_provider uuid;
  v_n integer := 0;
begin
  select * into j from public.marketplace_jobs where id = p_job_id for update;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'marketplace.post');
  if j.clarification_sent_at is not null then perform app.raise('already_sent', 'One clarification can be sent per job'); end if;
  if char_length(btrim(coalesce(p_body, ''))) < 3 then perform app.raise('message_required', 'Write the clarification'); end if;
  for v_provider in
    select provider_id from public.marketplace_messages where job_id = j.id
    union select provider_id from public.marketplace_proposals where job_id = j.id
  loop
    perform app.post_message(j.id, v_provider, false, p_body, true);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then perform app.raise('no_recipients', 'Nobody has asked or proposed yet'); end if;
  update public.marketplace_jobs set clarification_sent_at = now() where id = j.id;
  return v_n;
end $$;
revoke execute on function public.send_marketplace_clarification(uuid, text) from public, anon;
grant execute on function public.send_marketplace_clarification(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Proposals (MKT-09)
-- ---------------------------------------------------------------------------
create table public.marketplace_proposals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.marketplace_jobs (id) on delete cascade,
  provider_id uuid not null references public.organisations (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'withdrawn', 'expired', 'not_selected', 'accepted')),
  version integer not null default 1,
  valid_until timestamptz not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, provider_id)
);
create index marketplace_proposals_provider_idx on public.marketplace_proposals (provider_id);
create index marketplace_proposals_status_idx on public.marketplace_proposals (status, valid_until);
create trigger audit_marketplace_proposals after insert or update or delete on public.marketplace_proposals
  for each row execute function app.audit_row_change('provider_id');
alter table public.marketplace_proposals enable row level security;
revoke all on public.marketplace_proposals from anon, authenticated;
grant select on public.marketplace_proposals to authenticated;
create policy marketplace_proposals_read on public.marketplace_proposals for select to authenticated using (
  provider_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
  or exists (select 1 from public.marketplace_jobs j where j.id = marketplace_proposals.job_id));

create table public.marketplace_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.marketplace_proposals (id) on delete cascade,
  version integer not null,
  price_basis text not null check (price_basis in ('fixed', 'estimate', 'hourly')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  amount_max_cents bigint check (amount_max_cents is null or amount_max_cents >= 0),
  hourly_rate_cents bigint check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  callout_cents bigint check (callout_cents is null or callout_cents >= 0),
  gst_applies boolean not null,
  available_from date,
  available_to date,
  arrival_minutes integer check (arrival_minutes is null or arrival_minutes between 5 and 1440),
  valid_until timestamptz not null,
  inclusions text check (inclusions is null or char_length(inclusions) <= 2000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 2000),
  assumptions text check (assumptions is null or char_length(assumptions) <= 2000),
  note text check (note is null or char_length(note) <= 2000),
  fee_cents bigint not null,
  fee_consented_at timestamptz not null,
  created_by uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (proposal_id, version),
  constraint proposal_price check (
    (price_basis = 'fixed' and amount_cents is not null)
    or (price_basis = 'estimate' and amount_cents is not null and amount_max_cents is not null and amount_cents <= amount_max_cents)
    or (price_basis = 'hourly' and hourly_rate_cents is not null))
);
create index marketplace_proposal_versions_created_by_idx on public.marketplace_proposal_versions (created_by);
alter table public.marketplace_proposal_versions enable row level security;
revoke all on public.marketplace_proposal_versions from anon, authenticated;
grant select on public.marketplace_proposal_versions to authenticated;
create policy marketplace_proposal_versions_read on public.marketplace_proposal_versions for select to authenticated using (
  exists (select 1 from public.marketplace_proposals p where p.id = marketplace_proposal_versions.proposal_id));
create or replace function app.proposal_versions_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform app.raise('append_only', 'Proposal versions are kept as submitted');
  return null;
end $$;
create trigger proposal_versions_append_only before update or delete on public.marketplace_proposal_versions
  for each row execute function app.proposal_versions_append_only();

-- Submit or revise (MKT-09). p: price_basis, amount_cents, amount_max_cents, hourly_rate_cents, callout_cents, gst_applies,
-- available_from, available_to, arrival_minutes (urgent), valid_minutes, inclusions, exclusions, assumptions, note, fee_consent.
create or replace function public.submit_marketplace_proposal(p_provider_id uuid, p_job_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  pr public.marketplace_proposals%rowtype;
  v_block text;
  v_minutes integer;
  v_until timestamptz;
  v_fee bigint;
  v_badge text;
begin
  perform app.require_capability(p_provider_id, 'provider.proposals.manage');
  v_block := app.provider_proposal_block(p_provider_id);
  if v_block is not null then perform app.raise('not_eligible', v_block); end if;
  select * into j from public.marketplace_jobs where id = p_job_id for update;
  if j.id is null or not app.provider_can_see_job(p_provider_id, j) then perform app.raise('not_found', 'This job isn''t available'); end if;
  if j.status <> 'open' or j.closes_at <= now() then perform app.raise('job_closed', 'This job is no longer taking proposals'); end if;
  foreach v_badge in array j.required_badges loop
    if not exists (select 1 from public.provider_badges b where b.organisation_id = p_provider_id and b.kind = v_badge and b.revoked_at is null
                   and (b.expires_on is null or b.expires_on >= (now() at time zone 'Australia/Brisbane')::date)) then
      perform app.raise('badge_required', 'This job needs a verified ' || replace(v_badge, '_', ' ') || ' badge');
    end if;
  end loop;
  if not coalesce((p ->> 'fee_consent')::boolean, false) then
    perform app.raise('fee_consent_required', 'Agree to the connection fee to submit');
  end if;
  if (p ->> 'gst_applies') is null then perform app.raise('gst_required', 'Say whether GST applies'); end if;

  if j.urgency = 'urgent' then
    if nullif(p ->> 'arrival_minutes', '') is null then perform app.raise('arrival_required', 'Give your arrival time in minutes'); end if;
    v_minutes := coalesce(nullif(p ->> 'valid_minutes', '')::integer, app.setting_int('marketplace.urgent_proposal_validity_default_minutes'), 60);
    if v_minutes not between 15 and 240 then perform app.raise('invalid_validity', 'Urgent proposals are valid for 15 to 240 minutes'); end if;
  else
    if nullif(p ->> 'available_from', '') is null then perform app.raise('availability_required', 'Give the dates you can do the work'); end if;
    v_minutes := coalesce(nullif(p ->> 'valid_minutes', '')::integer, coalesce(app.setting_int('marketplace.proposal_validity_default_hours'), 72) * 60);
    if v_minutes not between 60 and 20160 then perform app.raise('invalid_validity', 'Proposals are valid for 1 hour to 14 days'); end if;
  end if;
  v_until := now() + make_interval(mins => v_minutes);
  v_fee := case when j.urgency = 'urgent' then app.setting_int('pricing.connection_fee_urgent_cents') else app.setting_int('pricing.connection_fee_standard_cents') end;

  select * into pr from public.marketplace_proposals where job_id = j.id and provider_id = p_provider_id for update;
  if pr.id is null then
    insert into public.marketplace_proposals (job_id, provider_id, valid_until) values (j.id, p_provider_id, v_until) returning * into pr;
  else
    if pr.status in ('accepted', 'not_selected') then perform app.raise('invalid_status', 'This proposal can no longer be changed'); end if;
    update public.marketplace_proposals set version = version + 1, status = 'active', valid_until = v_until, updated_at = now()
    where id = pr.id returning * into pr;
  end if;
  insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, amount_max_cents, hourly_rate_cents, callout_cents,
    gst_applies, available_from, available_to, arrival_minutes, valid_until, inclusions, exclusions, assumptions, note, fee_cents, fee_consented_at)
  values (pr.id, pr.version, p ->> 'price_basis', nullif(p ->> 'amount_cents', '')::bigint, nullif(p ->> 'amount_max_cents', '')::bigint,
    nullif(p ->> 'hourly_rate_cents', '')::bigint, nullif(p ->> 'callout_cents', '')::bigint, (p ->> 'gst_applies')::boolean,
    nullif(p ->> 'available_from', '')::date, nullif(p ->> 'available_to', '')::date, nullif(p ->> 'arrival_minutes', '')::integer, v_until,
    nullif(btrim(coalesce(p ->> 'inclusions', '')), ''), nullif(btrim(coalesce(p ->> 'exclusions', '')), ''),
    nullif(btrim(coalesce(p ->> 'assumptions', '')), ''), nullif(btrim(coalesce(p ->> 'note', '')), ''), v_fee, now());

  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select j.organisation_id, m.user_id, 'marketplace_proposal',
         case when pr.version = 1 then 'New proposal on ' else 'Revised proposal on ' end || j.title,
         (select o.name from public.organisations o where o.id = p_provider_id), 'marketplace/' || j.id
  from public.org_memberships m
  where m.organisation_id = j.organisation_id and m.status = 'active' and (m.user_id = j.posted_by or m.role in ('owner', 'account_owner'));
  return pr.id;
end $$;
revoke execute on function public.submit_marketplace_proposal(uuid, uuid, jsonb) from public, anon;
grant execute on function public.submit_marketplace_proposal(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.withdraw_marketplace_proposal(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.marketplace_proposals%rowtype;
begin
  select * into pr from public.marketplace_proposals where id = p_proposal_id for update;
  if pr.id is null then perform app.raise('not_found', 'Proposal not found'); end if;
  perform app.require_capability(pr.provider_id, 'provider.proposals.manage');
  if pr.status <> 'active' then perform app.raise('invalid_status', 'Only an active proposal can be withdrawn'); end if;
  update public.marketplace_proposals set status = 'withdrawn', updated_at = now() where id = pr.id;
end $$;
revoke execute on function public.withdraw_marketplace_proposal(uuid) from public, anon;
grant execute on function public.withdraw_marketplace_proposal(uuid) to authenticated, service_role;

-- Conflict of interest (MKT-20): the provider shares a member or an ABN with the poster.
create or replace function app.marketplace_conflict(p_provider uuid, p_poster uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_memberships a join public.org_memberships b on a.user_id = b.user_id
                 where a.organisation_id = p_provider and b.organisation_id = p_poster and a.status = 'active' and b.status = 'active')
      or exists (select 1 from public.organisations a, public.organisations b
                 where a.id = p_provider and b.id = p_poster and a.abn is not null and a.abn = b.abn)
$$;

-- Proposals on a job, for the poster to compare (MKT-10): terms, provider name, badges, regions and the conflict flag.
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
                 from public.provider_badges b where b.organisation_id = o.id and b.revoked_at is null)),
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
revoke execute on function public.list_job_proposals(uuid) from public, anon;
grant execute on function public.list_job_proposals(uuid) to authenticated, service_role;

-- Verified providers a poster can invite (MKT-21), with what HVEMS checked.
create or replace function public.search_marketplace_providers(p_organisation_id uuid, p_query text default null, p_category text default null, p_region text default null)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_query, ''))), '');
begin
  perform app.require_capability(p_organisation_id, 'marketplace.post');
  return query
  select jsonb_build_object('id', o.id, 'name', o.name, 'categories', pp.categories, 'mobile_service', pp.mobile_service,
    'accepting_urgent', pp.accepting_urgent, 'description', pp.description,
    'regions', (select coalesce(jsonb_agg(r.name order by r.sort_order), '[]') from public.marketplace_regions r where r.code = any (pp.region_codes)),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'details', b.details)), '[]')
               from public.provider_badges b where b.organisation_id = o.id and b.revoked_at is null))
  from public.provider_profiles pp
  join public.organisations o on o.id = pp.organisation_id
  where pp.status = 'verified'
    and (v_q is null or lower(o.name || ' ' || coalesce(pp.description, '')) like '%' || v_q || '%')
    and (p_category is null or p_category = any (pp.categories))
    and (p_region is null or p_region = any (pp.region_codes))
  order by o.name
  limit 100;
end $$;
revoke execute on function public.search_marketplace_providers(uuid, text, text, text) from public, anon;
grant execute on function public.search_marketplace_providers(uuid, text, text, text) to authenticated, service_role;

-- Close what has run out: jobs past their closing time and proposals past their validity.
create or replace function app.expire_marketplace() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_a integer; v_b integer;
begin
  update public.marketplace_jobs set status = 'expired' where status = 'open' and closes_at <= now();
  get diagnostics v_a = row_count;
  update public.marketplace_proposals set status = 'expired', updated_at = now() where status = 'active' and valid_until <= now();
  get diagnostics v_b = row_count;
  return v_a + v_b;
end $$;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hvems-marketplace-expiry', '*/5 * * * *', 'select app.expire_marketplace()');
  end if;
end $do$;

-- Marketplace work orders cost like vendor jobs (outside work) when closed.
create or replace function app.work_orders_post_costs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rate bigint;
  v_worker uuid := coalesce(new.completed_by, new.assigned_to);
  v_ref text := 'WO-' || lpad(new.number::text, 4, '0');
  c record;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if coalesce(new.labour_hours, 0) > 0 and new.kind = 'internal' and v_worker is not null then
      select hourly_rate_cents into v_rate from public.workforce_cost_rates where organisation_id = new.organisation_id and user_id = v_worker;
      if v_rate is not null then
        insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, created_by)
        values (new.organisation_id, 'work_order', md5(new.id::text || ':labour:' || new.reopen_count)::uuid, 'labour', new.id, new.asset_id,
                format('%s labour: %s h', v_ref, trim(to_char(new.labour_hours, 'FM999G990D00'))), round(new.labour_hours * v_rate)::bigint, auth.uid())
        on conflict (source_type, source_id) do nothing;
      end if;
    end if;
    if coalesce(new.cost_cents, 0) > 0 then
      insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, created_by)
      values (new.organisation_id, 'work_order', md5(new.id::text || ':other:' || new.reopen_count)::uuid,
              case when new.kind in ('vendor', 'marketplace') then 'external' else 'other' end, new.id, new.asset_id,
              format('%s %s', v_ref, case new.kind when 'vendor' then 'vendor: ' || coalesce(new.vendor_name, '')
                                                   when 'marketplace' then 'marketplace job' else 'other costs' end), new.cost_cents, auth.uid())
      on conflict (source_type, source_id) do nothing;
    end if;
  elsif old.status = 'closed' and new.status is distinct from 'closed' then
    for c in select * from public.cost_lines
             where source_type = 'work_order' and work_order_id = new.id and reverses_id is null and amount_cents > 0
               and source_id in (md5(new.id::text || ':labour:' || old.reopen_count)::uuid, md5(new.id::text || ':other:' || old.reopen_count)::uuid) loop
      insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, reverses_id, created_by)
      values (c.organisation_id, 'work_order', md5(c.id::text || ':reversal')::uuid, c.kind, c.work_order_id, c.asset_id, 'Reopened: ' || c.description,
              -c.amount_cents, c.id, auth.uid())
      on conflict (source_type, source_id) do nothing;
    end loop;
  end if;
  return null;
end $$;

-- Job attachments: <poster organisation>/<file>.
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('marketplace-files', 'marketplace-files', false, 26214400,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do nothing;
    execute $p$
      create policy marketplace_files_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'marketplace-files' and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('marketplace.post'))::text[])
      )$p$;
    -- The poster always; a provider only for files marked shared on a job it can see.
    execute $p$
      create policy marketplace_files_view on storage.objects for select to authenticated using (
        bucket_id = 'marketplace-files'
        and ((storage.foldername(name))[1] = any ((select app.orgs_with_capability('org.view'))::text[])
             or exists (select 1 from public.marketplace_job_files f join public.marketplace_jobs j on j.id = f.job_id
                        where f.path = name and f.shared
                          and exists (select 1 from unnest((select app.orgs_with_capability('provider.jobs.browse'))::uuid[]) pv
                                      where app.provider_can_see_job(pv, j))))
      )$p$;
  end if;
end $do$;
