-- =============================================================================
-- Console settings with history (ADM-08), platform dashboard (ADM-09, RPT-07),
-- and converting a marketplace-only customer into a company (CS-09, ACC, AST-04).
-- * A Platform Administrator changes a setting with a reason; the value keeps its
--   type; every change is kept (who, when, from, to, why) and audited.
-- * Platform figures for the console: organisations, managed equipment, safety
--   counts only, marketplace activity and the verification backlog.
-- * Conversion keeps the same organisation (so every past job, engagement and
--   message stays where it is): the kind becomes company, the Account Owner
--   becomes Owner, Job Managers become Fleet Managers with the Marketplace Buyer
--   grant. Job equipment can then be converted to managed assets, keeping its jobs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings history (ADM-08)
-- ---------------------------------------------------------------------------
create table public.platform_setting_changes (
  id bigint generated always as identity primary key,
  key text not null references public.platform_settings (key) on delete cascade,
  old_value jsonb,
  new_value jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  changed_by uuid references auth.users (id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);
create index platform_setting_changes_key_idx on public.platform_setting_changes (key, changed_at desc);
create index platform_setting_changes_by_idx on public.platform_setting_changes (changed_by);
alter table public.platform_setting_changes enable row level security;
revoke all on public.platform_setting_changes from anon, authenticated;
grant select on public.platform_setting_changes to authenticated;
create policy platform_setting_changes_read on public.platform_setting_changes for select to authenticated using ((select app.is_platform_staff()));
create trigger platform_setting_changes_append_only before update or delete on public.platform_setting_changes
  for each row execute function app.prevent_audit_mutation();

create or replace function public.set_platform_setting(p_key text, p_value jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.platform_settings%rowtype;
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Platform Administrator changes settings');
  end if;
  select * into s from public.platform_settings where key = p_key for update;
  if s.key is null then perform app.raise('not_found', 'Unknown setting'); end if;
  if p_value is null or jsonb_typeof(p_value) <> jsonb_typeof(s.value) then
    perform app.raise('invalid_value', format('This setting takes a %s', case jsonb_typeof(s.value) when 'number' then 'number' when 'boolean' then 'yes/no value' when 'string' then 'text value' else jsonb_typeof(s.value) end));
  end if;
  if jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric < 0 then
    perform app.raise('invalid_value', 'Settings can''t be negative');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give the reason for the change'); end if;
  if s.value = p_value then return; end if;
  insert into public.platform_setting_changes (key, old_value, new_value, reason) values (s.key, s.value, p_value, btrim(p_reason));
  update public.platform_settings set value = p_value, updated_by = auth.uid() where key = s.key;
  perform app.audit('update', 'platform_settings', null, null, jsonb_build_object('key', s.key, 'from', s.value, 'to', p_value), jsonb_build_object('reason', btrim(p_reason)));
end $$;
revoke execute on function public.set_platform_setting(text, jsonb, text) from public, anon;
grant execute on function public.set_platform_setting(text, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Platform dashboard (ADM-09, RPT-07). Safety figures are counts only.
-- ---------------------------------------------------------------------------
create or replace function public.platform_dashboard(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366)));
begin
  if not app.is_platform_staff() then perform app.raise('forbidden', 'HVEMS staff only'); end if;
  return jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 366)),
    'organisations', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from public.organisations where closed_at is null group by kind) x),
    'managed_assets', (select count(*) from public.assets where archived_at is null),
    'inspections', (select count(*) from public.inspections where submitted_at >= v_from),
    'open_critical_defects', (select count(*) from public.defects where status = 'open' and severity = 'critical'),
    'jobs_posted', (select count(*) from public.marketplace_jobs where posted_at >= v_from),
    'jobs_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.marketplace_jobs where posted_at >= v_from group by status) x),
    'jobs_by_region', (select coalesce(jsonb_object_agg(r.name, n), '{}') from (select region_code, count(*) n from public.marketplace_jobs where posted_at >= v_from group by region_code) x
                       join public.marketplace_regions r on r.code = x.region_code),
    'proposals_per_job', (select round(avg(n)::numeric, 1) from (select j.id, count(p.id) n from public.marketplace_jobs j left join public.marketplace_proposals p on p.job_id = j.id
                          where j.posted_at >= v_from group by j.id) x),
    'first_proposal_minutes', (select jsonb_object_agg(urgency, m) from (
        select j.urgency, round(percentile_cont(0.5) within group (order by extract(epoch from (fp - j.posted_at)) / 60)) m
        from public.marketplace_jobs j
        join lateral (select min(p.submitted_at) fp from public.marketplace_proposals p where p.job_id = j.id) f on f.fp is not null
        where j.posted_at >= v_from group by j.urgency) x),
    'engagements', (select count(*) from public.marketplace_engagements where accepted_at >= v_from),
    'acceptance_rate', (select case when count(*) > 0 then round(100.0 * count(*) filter (where exists (select 1 from public.marketplace_engagements e where e.job_id = j.id)) / count(*)) end
                        from public.marketplace_jobs j where j.posted_at >= v_from and j.status <> 'open'),
    'cancellations', (select count(*) from public.marketplace_engagements where cancelled_at >= v_from and cancel_category is distinct from 'no_show'),
    'no_shows', (select count(*) from public.provider_strikes where reason = 'no_show' and created_at >= v_from),
    'reviews', (select jsonb_build_object('count', count(*), 'average', round(avg(rating)::numeric, 1)) from public.engagement_reviews where created_at >= v_from and removed_at is null),
    'fees_recorded_cents', (select coalesce(sum(poster_fee_cents + provider_fee_cents), 0) from public.marketplace_engagements where accepted_at >= v_from and status <> 'cancelled'),
    'verification_backlog', (select count(*) from public.provider_profiles where status = 'submitted'),
    'open_cases', (select count(*) from public.marketplace_cases where status in ('awaiting_response', 'under_review')),
    'verified_providers', (select count(*) from public.provider_profiles where status = 'verified'));
end $$;
revoke execute on function public.platform_dashboard(integer) from public, anon;
grant execute on function public.platform_dashboard(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Conversion of a marketplace-only customer to a company (CS-09)
-- ---------------------------------------------------------------------------
create or replace function public.convert_to_company(p_organisation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.organisations%rowtype;
  m record;
begin
  select * into o from public.organisations where id = p_organisation_id for update;
  if o.id is null then perform app.raise('not_found', 'Organisation not found'); end if;
  if o.kind <> 'marketplace_customer' then perform app.raise('invalid_kind', 'Only a marketplace-only account converts to a company'); end if;
  if app.membership_role(o.id) is distinct from 'account_owner' then perform app.raise('forbidden', 'Only the Account Owner converts the account'); end if;
  if o.status <> 'active' then perform app.raise('invalid_status', 'The account must be active'); end if;

  -- The kind changes first; the role check on each membership update then validates the company roles.
  update public.organisations set kind = 'company', operator_code = coalesce(operator_code, app.new_operator_code()) where id = o.id;
  update public.org_memberships set role = case role when 'account_owner' then 'owner'::public.member_role when 'job_manager' then 'fleet_manager'::public.member_role else role end
  where organisation_id = o.id;
  if exists (select 1 from public.org_memberships x where x.organisation_id = o.id and not app.role_valid_for_kind(x.role, 'company')) then
    perform app.raise('invalid_role', 'A member has a role that companies don''t use');
  end if;
  -- Former Job Managers keep the right to post and accept jobs.
  for m in select id from public.org_memberships where organisation_id = o.id and role = 'fleet_manager' and status = 'active' loop
    insert into public.membership_grants (organisation_id, membership_id, grant_type)
    values (o.id, m.id, 'marketplace_buyer')
    on conflict do nothing;
  end loop;
  perform app.audit('convert', 'organisations', o.id, o.id, jsonb_build_object('kind', jsonb_build_object('from', 'marketplace_customer', 'to', 'company')), '{}'::jsonb);
end $$;
revoke execute on function public.convert_to_company(uuid) from public, anon;
grant execute on function public.convert_to_company(uuid) to authenticated, service_role;

-- AST-04: turn the equipment described on a past job into a managed asset; its jobs keep their history.
-- Mandatory fields are checked by the normal asset rules (the insert below goes through them).
create or replace function public.convert_job_asset(p_job_id uuid, p_asset_number text, p_asset_class_id uuid, p_make text default null, p_model text default null,
  p_registration text default null, p_registration_state text default null, p_year integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_id uuid;
begin
  select * into j from public.marketplace_jobs where id = p_job_id for update;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'assets.manage');
  if (select kind from public.organisations where id = j.organisation_id) <> 'company' then
    perform app.raise('invalid_kind', 'Convert the account to a company first');
  end if;
  if j.asset_id is not null then perform app.raise('already_managed', 'This job is already linked to managed equipment'); end if;
  insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, registration_number, registration_state, year)
  values (j.organisation_id, btrim(p_asset_number), p_asset_class_id, nullif(btrim(coalesce(p_make, '')), ''), nullif(btrim(coalesce(p_model, '')), ''),
          nullif(btrim(coalesce(p_registration, '')), ''), nullif(btrim(coalesce(p_registration_state, '')), ''), p_year)
  returning id into v_id;
  -- Every job that described the same equipment (same registration, or this job) moves with it.
  update public.marketplace_jobs set asset_id = v_id
  where organisation_id = j.organisation_id and asset_id is null
    and (id = j.id or (p_registration is not null and shared_asset ->> 'registration' = btrim(p_registration)));
  return v_id;
end $$;
revoke execute on function public.convert_job_asset(uuid, text, uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.convert_job_asset(uuid, text, uuid, text, text, text, text, integer) to authenticated, service_role;
