-- =============================================================================
-- HVEMS 2A — Identity, organisations, memberships, roles and grants
-- Scope: CS-01, CS-02, CS-03, CS-04 (foundation), CS-05, CS-06 (foundation), CS-25
--
-- Design (see docs/decisions/ADR-003-tenancy-and-permissions.md):
--   * One Supabase Auth identity per person (SoW §2.5).
--   * Company organisations, marketplace-only customers and provider accounts
--     are all rows in `organisations`, distinguished by `kind`. A membership
--     gives a person exactly one role in one organisation; roles are valid only
--     for their organisation kind, so a company membership can never carry a
--     provider role (SoW §2.5 "a company membership never grants provider access").
--   * Permission = role capabilities + grant capabilities, evaluated in the
--     database against the ROW's organisation. The client's "active organisation"
--     is a UI preference only and grants nothing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null,
  full_name text not null default '' check (char_length(full_name) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  email_bounced_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(coalesce(new.email, '')), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

create or replace function app.handle_auth_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function app.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- ABN validation (Australian Business Register checksum)
-- ---------------------------------------------------------------------------
create or replace function app.is_valid_abn(p_abn text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  digits text := regexp_replace(coalesce(p_abn, ''), '\s', '', 'g');
  weights int[] := array[10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  total int := 0;
  d int;
begin
  if digits !~ '^\d{11}$' then
    return false;
  end if;
  for i in 1..11 loop
    d := substr(digits, i, 1)::int;
    if i = 1 then d := d - 1; end if;
    total := total + d * weights[i];
  end loop;
  return total % 89 = 0;
end $$;

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  kind public.organisation_kind not null,
  name text not null check (char_length(btrim(name)) between 2 and 200),
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  abn text check (abn is null or app.is_valid_abn(abn)),
  status public.organisation_status not null default 'active',
  timezone text not null default 'Australia/Brisbane',
  -- Company rules HVEMS lets each company switch (SoW §3.4)
  settings jsonb not null default jsonb_build_object(
    'overdue_service_sets_needs_attention', false,
    'repairer_cannot_clear_own_critical', false
  ),
  -- Billing bookkeeping (SoW §5.2): the calendar month (QLD) in which the company
  -- first went above the free allowance is its one-off introductory month.
  first_exceeded_free_allowance_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint organisations_provider_requires_abn check (kind <> 'provider' or abn is not null)
);
create index organisations_kind_idx on public.organisations (kind);
create index organisations_name_trgm_idx on public.organisations (lower(name));
create trigger organisations_updated_at before update on public.organisations
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Memberships and grants
-- ---------------------------------------------------------------------------
create or replace function app.role_valid_for_kind(p_role public.member_role, p_kind public.organisation_kind)
returns boolean language sql immutable set search_path = '' as $$
  select case p_kind
    when 'company' then p_role in ('owner', 'administrator', 'fleet_manager', 'technician', 'driver_operator', 'finance', 'viewer')
    when 'marketplace_customer' then p_role in ('account_owner', 'job_manager')
    when 'provider' then p_role in ('provider_owner', 'provider_manager', 'provider_technician')
  end
$$;

create table public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- References profiles (1:1 with auth.users) so the Data API can embed member profiles.
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (organisation_id, user_id),
  unique (id, organisation_id)
);
create index org_memberships_user_idx on public.org_memberships (user_id) where status = 'active';
create trigger org_memberships_updated_at before update on public.org_memberships
  for each row execute function app.set_updated_at();

create or replace function app.check_membership_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k public.organisation_kind;
begin
  select kind into k from public.organisations where id = new.organisation_id;
  if not app.role_valid_for_kind(new.role, k) then
    perform app.raise('role_not_valid_for_account_type',
      format('Role %s is not available for %s accounts', new.role, k));
  end if;
  return new;
end $$;

create trigger org_memberships_role_check before insert or update of role, organisation_id on public.org_memberships
  for each row execute function app.check_membership_role();

-- Which roles may hold which grant (SoW §2.4: drivers have no purchasing,
-- clearance or marketplace authority; technicians have no marketplace access;
-- viewers are read-only). Owners hold Clearance Authority and marketplace
-- authority by role, so they never need these grants.
create or replace function app.grant_valid_for_role(p_grant public.member_grant, p_role public.member_role)
returns boolean language sql immutable set search_path = '' as $$
  select case p_grant
    when 'clearance_authority' then p_role in ('administrator', 'fleet_manager', 'technician')
    when 'approval_limit'      then p_role in ('owner', 'administrator', 'fleet_manager', 'technician', 'finance')
    when 'marketplace_buyer'   then p_role in ('administrator', 'fleet_manager', 'finance')
  end
$$;

create table public.membership_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  membership_id uuid not null,
  grant_type public.member_grant not null,
  approval_limit_cents bigint check (approval_limit_cents is null or approval_limit_cents >= 0),
  competency_note text check (competency_note is null or char_length(competency_note) <= 2000),
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text,
  foreign key (membership_id, organisation_id) references public.org_memberships (id, organisation_id) on delete cascade,
  constraint grants_limit_amount check ((grant_type = 'approval_limit') = (approval_limit_cents is not null)),
  constraint grants_clearance_competency check (grant_type <> 'clearance_authority' or char_length(btrim(coalesce(competency_note, ''))) >= 3)
);
create unique index membership_grants_one_active on public.membership_grants (membership_id, grant_type) where revoked_at is null;
create index membership_grants_org_idx on public.membership_grants (organisation_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Capability model. Single source of truth, mirrored by packages/permissions
-- (a unit test fails if the two drift apart).
-- ---------------------------------------------------------------------------
create table app.role_capabilities (
  role public.member_role not null,
  capability text not null,
  primary key (role, capability)
);

create table app.grant_capabilities (
  grant_type public.member_grant not null,
  capability text not null,
  primary key (grant_type, capability)
);

-- BEGIN CAPABILITY SEED (generated from packages/permissions/src/matrix.ts — keep in sync)
insert into app.role_capabilities (role, capability) values
  ('owner', 'org.view'),
  ('owner', 'org.settings.manage'),
  ('owner', 'org.members.manage'),
  ('owner', 'org.grants.assign'),
  ('owner', 'org.billing.view'),
  ('owner', 'org.billing.manage'),
  ('owner', 'org.close'),
  ('owner', 'audit.view'),
  ('owner', 'support_access.view'),
  ('owner', 'data.full_export'),
  ('owner', 'assets.view'),
  ('owner', 'assets.manage'),
  ('owner', 'assets.costs.view'),
  ('owner', 'clients.view'),
  ('owner', 'clients.manage'),
  ('owner', 'sites.view'),
  ('owner', 'sites.manage'),
  ('owner', 'meter_readings.record'),
  ('owner', 'meter_readings.accept'),
  ('owner', 'templates.manage'),
  ('owner', 'inspections.submit'),
  ('owner', 'inspections.review'),
  ('owner', 'defects.report'),
  ('owner', 'defects.triage'),
  ('owner', 'defects.clear_non_critical'),
  ('owner', 'holds.place'),
  ('owner', 'drivers.manage'),
  ('owner', 'work_orders.manage'),
  ('owner', 'work_orders.work'),
  ('owner', 'workforce.manage'),
  ('owner', 'parts.request'),
  ('owner', 'reports.view'),
  ('owner', 'reports.export'),
  ('owner', 'defects.clear_critical'),
  ('owner', 'assets.return_to_service'),
  ('owner', 'defects.lower_severity'),
  ('owner', 'defects.dismiss_critical'),
  ('owner', 'defects.defer_minor'),
  ('owner', 'holds.remove_out_of_service'),
  ('owner', 'marketplace.post'),
  ('owner', 'marketplace.accept'),
  ('administrator', 'org.view'),
  ('administrator', 'org.settings.manage'),
  ('administrator', 'org.members.manage'),
  ('administrator', 'org.grants.assign'),
  ('administrator', 'audit.view'),
  ('administrator', 'assets.view'),
  ('administrator', 'assets.manage'),
  ('administrator', 'assets.costs.view'),
  ('administrator', 'clients.view'),
  ('administrator', 'clients.manage'),
  ('administrator', 'sites.view'),
  ('administrator', 'sites.manage'),
  ('administrator', 'meter_readings.record'),
  ('administrator', 'meter_readings.accept'),
  ('administrator', 'templates.manage'),
  ('administrator', 'inspections.submit'),
  ('administrator', 'inspections.review'),
  ('administrator', 'defects.report'),
  ('administrator', 'defects.triage'),
  ('administrator', 'defects.clear_non_critical'),
  ('administrator', 'holds.place'),
  ('administrator', 'drivers.manage'),
  ('administrator', 'work_orders.manage'),
  ('administrator', 'work_orders.work'),
  ('administrator', 'workforce.manage'),
  ('administrator', 'parts.request'),
  ('administrator', 'reports.view'),
  ('administrator', 'reports.export'),
  ('fleet_manager', 'org.view'),
  ('fleet_manager', 'assets.view'),
  ('fleet_manager', 'assets.costs.view'),
  ('fleet_manager', 'clients.view'),
  ('fleet_manager', 'sites.view'),
  ('fleet_manager', 'meter_readings.record'),
  ('fleet_manager', 'meter_readings.accept'),
  ('fleet_manager', 'inspections.submit'),
  ('fleet_manager', 'inspections.review'),
  ('fleet_manager', 'defects.report'),
  ('fleet_manager', 'defects.triage'),
  ('fleet_manager', 'defects.clear_non_critical'),
  ('fleet_manager', 'holds.place'),
  ('fleet_manager', 'drivers.manage'),
  ('fleet_manager', 'work_orders.manage'),
  ('fleet_manager', 'work_orders.work'),
  ('fleet_manager', 'workforce.manage'),
  ('fleet_manager', 'parts.request'),
  ('fleet_manager', 'reports.view'),
  ('fleet_manager', 'reports.export'),
  ('technician', 'org.view'),
  ('technician', 'assets.view'),
  ('technician', 'clients.view'),
  ('technician', 'sites.view'),
  ('technician', 'meter_readings.record'),
  ('technician', 'inspections.submit'),
  ('technician', 'defects.report'),
  ('technician', 'work_orders.work'),
  ('technician', 'parts.request'),
  ('driver_operator', 'org.view'),
  ('driver_operator', 'assets.view_permitted'),
  ('driver_operator', 'sites.view'),
  ('driver_operator', 'meter_readings.record'),
  ('driver_operator', 'inspections.submit'),
  ('driver_operator', 'defects.report'),
  ('finance', 'org.view'),
  ('finance', 'org.billing.view'),
  ('finance', 'org.billing.manage'),
  ('finance', 'assets.view'),
  ('finance', 'assets.costs.view'),
  ('finance', 'clients.view'),
  ('finance', 'sites.view'),
  ('finance', 'reports.view'),
  ('finance', 'reports.export'),
  ('viewer', 'org.view'),
  ('viewer', 'assets.view'),
  ('viewer', 'clients.view'),
  ('viewer', 'sites.view'),
  ('viewer', 'reports.view'),
  ('viewer', 'reports.export'),
  ('account_owner', 'org.view'),
  ('account_owner', 'org.settings.manage'),
  ('account_owner', 'org.members.manage'),
  ('account_owner', 'org.billing.view'),
  ('account_owner', 'org.billing.manage'),
  ('account_owner', 'org.close'),
  ('account_owner', 'audit.view'),
  ('account_owner', 'support_access.view'),
  ('account_owner', 'data.full_export'),
  ('account_owner', 'marketplace.post'),
  ('account_owner', 'marketplace.accept'),
  ('job_manager', 'org.view'),
  ('job_manager', 'marketplace.post'),
  ('job_manager', 'marketplace.accept'),
  ('provider_owner', 'org.view'),
  ('provider_owner', 'org.settings.manage'),
  ('provider_owner', 'org.members.manage'),
  ('provider_owner', 'org.billing.view'),
  ('provider_owner', 'org.billing.manage'),
  ('provider_owner', 'org.close'),
  ('provider_owner', 'audit.view'),
  ('provider_owner', 'support_access.view'),
  ('provider_owner', 'data.full_export'),
  ('provider_owner', 'provider.profile.manage'),
  ('provider_owner', 'provider.verification.submit'),
  ('provider_owner', 'provider.jobs.browse'),
  ('provider_owner', 'provider.proposals.manage'),
  ('provider_owner', 'provider.engagements.manage'),
  ('provider_owner', 'provider.engagements.work'),
  ('provider_manager', 'org.view'),
  ('provider_manager', 'provider.jobs.browse'),
  ('provider_manager', 'provider.proposals.manage'),
  ('provider_manager', 'provider.engagements.manage'),
  ('provider_manager', 'provider.engagements.work'),
  ('provider_technician', 'org.view'),
  ('provider_technician', 'provider.engagements.work');

insert into app.grant_capabilities (grant_type, capability) values
  ('clearance_authority', 'defects.clear_critical'),
  ('clearance_authority', 'assets.return_to_service'),
  ('clearance_authority', 'defects.lower_severity'),
  ('clearance_authority', 'defects.dismiss_critical'),
  ('clearance_authority', 'defects.defer_minor'),
  ('clearance_authority', 'holds.remove_out_of_service'),
  ('approval_limit', 'parts.approve'),
  ('marketplace_buyer', 'marketplace.post'),
  ('marketplace_buyer', 'marketplace.accept');
-- END CAPABILITY SEED

-- ---------------------------------------------------------------------------
-- Invitations (token stored only as a SHA-256 hash)
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null,
  token_hash bytea not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_not_owner check (role not in ('owner', 'account_owner', 'provider_owner'))
);
create unique index invitations_one_pending on public.invitations (organisation_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- HVEMS staff and support access (SoW §2.3, §2.6)
-- ---------------------------------------------------------------------------
create table public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.platform_role not null,
  authorities public.platform_authority[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) >= 10),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index support_access_active_idx on public.support_access_grants (staff_user_id, organisation_id, expires_at)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- Saved payment methods (populated only by the Stripe webhook, increment 2D).
-- Created now because MFA and fleet-consent rules depend on whether one exists.
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  stripe_payment_method_id text not null unique,
  brand text,
  last4 text check (last4 is null or last4 ~ '^\d{4}$'),
  exp_month smallint,
  exp_year smallint,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  detached_at timestamptz
);
create index payment_methods_org_idx on public.payment_methods (organisation_id) where detached_at is null;

-- ---------------------------------------------------------------------------
-- Permission helpers (SECURITY DEFINER, fixed search_path, used by RLS)
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_staff(p_roles public.platform_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt_aal() = 'aal2', false) and exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.active
      and (p_roles is null or s.role = any (p_roles))
  )
$$;

create or replace function app.has_platform_authority(p_authority public.platform_authority)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt_aal() = 'aal2', false) and exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.active
      and (s.role = 'platform_administrator' or p_authority = any (s.authorities))
  )
$$;

-- Organisations where the current user holds the capability, through role or grant.
create or replace function app.orgs_with_capability(p_capability text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.organisation_id), '{}')
  from public.org_memberships m
  join public.organisations o on o.id = m.organisation_id and o.status <> 'closed'
  where m.user_id = auth.uid()
    and m.status = 'active'
    and (
      exists (select 1 from app.role_capabilities rc where rc.role = m.role and rc.capability = p_capability)
      or exists (
        select 1 from public.membership_grants g
        join app.grant_capabilities gc on gc.grant_type = g.grant_type and gc.capability = p_capability
        where g.membership_id = m.id and g.revoked_at is null
      )
    )
$$;

create or replace function app.has_capability(p_organisation_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_organisation_id = any (app.orgs_with_capability(p_capability))
$$;

create or replace function app.member_orgs()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.organisation_id), '{}')
  from public.org_memberships m
  join public.organisations o on o.id = m.organisation_id and o.status <> 'closed'
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.orgs_with_support_access()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct g.organisation_id), '{}')
  from public.support_access_grants g
  where g.staff_user_id = auth.uid()
    and g.ended_at is null
    and now() between g.starts_at and g.expires_at
    and app.is_platform_staff(array['platform_administrator', 'support_agent']::public.platform_role[])
$$;

-- People who share at least one active organisation with the current user.
create or replace function app.co_member_user_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct other.user_id), '{}')
  from public.org_memberships mine
  join public.org_memberships other on other.organisation_id = mine.organisation_id and other.status = 'active'
  where mine.user_id = auth.uid() and mine.status = 'active'
$$;

create or replace function app.membership_role(p_organisation_id uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.user_id = auth.uid() and m.status = 'active'
$$;

-- SoW §2.5: MFA is required for company Owners, Administrators and Finance once
-- the company has a second member or a saved payment method; for Provider
-- Owners once a payment method is saved. (HVEMS staff: always — enforced by
-- app.is_platform_staff requiring aal2.)
create or replace function app.mfa_required(p_organisation_id uuid, p_user_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  with m as (
    select role from public.org_memberships
    where organisation_id = p_organisation_id and user_id = coalesce(p_user_id, auth.uid()) and status = 'active'
  ),
  facts as (
    select
      (select count(*) from public.org_memberships where organisation_id = p_organisation_id and status = 'active') as members,
      exists (select 1 from public.payment_methods where organisation_id = p_organisation_id and detached_at is null) as has_pm
  )
  select coalesce((
    select case
      when m.role in ('owner', 'administrator', 'finance') then f.members >= 2 or f.has_pm
      when m.role = 'provider_owner' then f.has_pm
      else false
    end
    from m, facts f
  ), false)
$$;

create or replace function app.require_mfa_if_needed(p_organisation_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.mfa_required(p_organisation_id) and coalesce(app.jwt_aal(), 'aal1') <> 'aal2' then
    perform app.raise('mfa_required', 'Multi-factor authentication is required for this action');
  end if;
end $$;

create or replace function app.require_capability(p_organisation_id uuid, p_capability text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    perform app.raise('not_authenticated', 'Sign in required');
  end if;
  if not app.has_capability(p_organisation_id, p_capability) then
    perform app.raise('forbidden', 'You do not have permission to do this', jsonb_build_object('capability', p_capability));
  end if;
end $$;

-- Free-tier member-login limit (SoW §5.2, D-05). Counted at invitation and acceptance.
create or replace function app.current_asset_count(p_organisation_id uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  n integer := 0;
begin
  -- assets table is created in the fleet migration; tolerate its absence here.
  if to_regclass('public.assets') is not null then
    execute 'select count(*) from public.assets where organisation_id = $1 and archived_at is null'
      into n using p_organisation_id;
  end if;
  return n;
end $$;

create or replace function app.member_limit_reached(p_organisation_id uuid, p_include_pending boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  k public.organisation_kind;
  members integer;
  pending integer := 0;
begin
  select kind into k from public.organisations where id = p_organisation_id;
  if k <> 'company' then
    return false;  -- the limit applies to company organisations only
  end if;
  if app.current_asset_count(p_organisation_id) > app.setting_int('pricing.fleet_free_assets') then
    return false;
  end if;
  select count(*) into members from public.org_memberships where organisation_id = p_organisation_id and status = 'active';
  if p_include_pending then
    select count(*) into pending from public.invitations
    where organisation_id = p_organisation_id and accepted_at is null and revoked_at is null and expires_at > now();
  end if;
  return members + pending >= app.setting_int('free_tier.member_login_limit');
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.org_memberships enable row level security;
alter table public.membership_grants enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_staff enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.payment_methods enable row level security;

revoke all on public.profiles, public.organisations, public.org_memberships, public.membership_grants,
  public.invitations, public.platform_staff, public.support_access_grants, public.payment_methods
  from anon, authenticated;

grant select on public.profiles, public.organisations, public.org_memberships, public.membership_grants,
  public.invitations, public.platform_staff, public.support_access_grants, public.payment_methods
  to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant update (name, legal_name, abn, timezone, settings) on public.organisations to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or id = any ((select app.co_member_user_ids())::uuid[])
  or (select app.is_platform_staff())
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organisations_read on public.organisations for select to authenticated using (
  id = any ((select app.member_orgs())::uuid[])
  or id = any ((select app.orgs_with_support_access())::uuid[])
  or (select app.is_platform_staff())
);
create policy organisations_update on public.organisations for update to authenticated
  using (id = any ((select app.orgs_with_capability('org.settings.manage'))::uuid[]))
  with check (id = any ((select app.orgs_with_capability('org.settings.manage'))::uuid[]));

create policy memberships_read on public.org_memberships for select to authenticated using (
  user_id = (select auth.uid())
  or organisation_id = any ((select app.member_orgs())::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
  or (select app.is_platform_staff())
);

create policy grants_read on public.membership_grants for select to authenticated using (
  organisation_id = any ((select app.member_orgs())::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
  or (select app.is_platform_staff())
);

create policy invitations_read on public.invitations for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.members.manage'))::uuid[])
  or (select app.is_platform_staff())
);

create policy platform_staff_read on public.platform_staff for select to authenticated using (
  user_id = (select auth.uid()) or (select app.is_platform_staff())
);

create policy support_access_read on public.support_access_grants for select to authenticated using (
  staff_user_id = (select auth.uid())
  or organisation_id = any ((select app.orgs_with_capability('support_access.view'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[]))
);

create policy payment_methods_read on public.payment_methods for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])
);

-- Audit and security events become readable now that helpers exist.
grant select on public.audit_events, public.security_events to authenticated;
create policy audit_events_read on public.audit_events for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('audit.view'))::uuid[])
  or (select app.is_platform_staff())
);
create policy security_events_read on public.security_events for select to authenticated using (
  user_id = (select auth.uid())
  or organisation_id = any ((select app.orgs_with_capability('audit.view'))::uuid[])
  or (select app.is_platform_staff())
);

-- Audit triggers
create trigger audit_organisations after insert or update or delete on public.organisations
  for each row execute function app.audit_row_change('id');
create trigger audit_org_memberships after insert or update or delete on public.org_memberships
  for each row execute function app.audit_row_change();
create trigger audit_membership_grants after insert or update or delete on public.membership_grants
  for each row execute function app.audit_row_change();
create trigger audit_invitations after insert or update or delete on public.invitations
  for each row execute function app.audit_row_change('organisation_id', 'token_hash');
create trigger audit_platform_staff after insert or update or delete on public.platform_staff
  for each row execute function app.audit_row_change('none');
create trigger audit_support_access after insert or update or delete on public.support_access_grants
  for each row execute function app.audit_row_change();
create trigger audit_platform_settings after insert or update or delete on public.platform_settings
  for each row execute function app.audit_row_change('none');

-- ---------------------------------------------------------------------------
-- RPCs (the Data API surface shared by web and future mobile clients)
-- ---------------------------------------------------------------------------

-- Create an organisation of any kind; the creator becomes its owner role.
create or replace function public.create_organisation(p_kind public.organisation_kind, p_name text, p_abn text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role public.member_role;
  v_abn text := nullif(regexp_replace(coalesce(p_abn, ''), '\s', '', 'g'), '');
begin
  if v_uid is null then
    perform app.raise('not_authenticated', 'Sign in required');
  end if;
  if v_abn is not null and not app.is_valid_abn(v_abn) then
    perform app.raise('invalid_abn', 'The ABN is not valid');
  end if;
  if p_kind = 'provider' and v_abn is null then
    perform app.raise('abn_required', 'Provider accounts need an ABN');
  end if;

  v_role := case p_kind when 'company' then 'owner' when 'marketplace_customer' then 'account_owner' else 'provider_owner' end;

  insert into public.organisations (kind, name, abn, created_by)
  values (p_kind, btrim(p_name), v_abn, v_uid)
  returning id into v_org;

  insert into public.org_memberships (organisation_id, user_id, role)
  values (v_org, v_uid, v_role);

  return v_org;
end $$;

-- Contexts the current user can work in (organisation + portal switcher).
create or replace function public.my_contexts()
returns table (
  organisation_id uuid, organisation_name text, kind public.organisation_kind,
  role public.member_role, status public.organisation_status, mfa_required boolean
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.kind, m.role, o.status, app.mfa_required(o.id)
  from public.org_memberships m
  join public.organisations o on o.id = m.organisation_id
  where m.user_id = auth.uid() and m.status = 'active' and o.status <> 'closed'
  order by o.kind, o.name
$$;

create or replace function public.my_capabilities(p_organisation_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct cap order by cap), '{}') from (
    select rc.capability as cap
    from public.org_memberships m
    join public.organisations o on o.id = m.organisation_id and o.status <> 'closed'
    join app.role_capabilities rc on rc.role = m.role
    where m.organisation_id = p_organisation_id and m.user_id = auth.uid() and m.status = 'active'
    union
    select gc.capability
    from public.org_memberships m
    join public.organisations o on o.id = m.organisation_id and o.status <> 'closed'
    join public.membership_grants g on g.membership_id = m.id and g.revoked_at is null
    join app.grant_capabilities gc on gc.grant_type = g.grant_type
    where m.organisation_id = p_organisation_id and m.user_id = auth.uid() and m.status = 'active'
  ) caps
$$;

create or replace function public.my_staff_context()
returns table (role public.platform_role, authorities public.platform_authority[], mfa_satisfied boolean)
language sql stable security definer set search_path = '' as $$
  select s.role, s.authorities, coalesce(app.jwt_aal() = 'aal2', false)
  from public.platform_staff s where s.user_id = auth.uid() and s.active
$$;

-- Invite a person by email. Returns the one-time token (only its hash is stored).
create or replace function public.create_invitation(p_organisation_id uuid, p_email text, p_role public.member_role)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_kind public.organisation_kind;
  v_status public.organisation_status;
  v_id uuid;
  v_exp timestamptz;
begin
  perform app.require_capability(p_organisation_id, 'org.members.manage');
  perform app.require_mfa_if_needed(p_organisation_id);

  select kind, status into v_kind, v_status from public.organisations where id = p_organisation_id for update;
  if v_status = 'restricted' then
    perform app.raise('account_restricted', 'New members cannot be added while the account is restricted for non-payment');
  end if;
  if not app.role_valid_for_kind(p_role, v_kind) or p_role in ('owner', 'account_owner', 'provider_owner') then
    perform app.raise('role_not_valid_for_account_type', 'That role cannot be invited for this account');
  end if;
  if exists (
    select 1 from public.org_memberships m join public.profiles p on p.id = m.user_id
    where m.organisation_id = p_organisation_id and m.status = 'active' and p.email = lower(btrim(p_email))
  ) then
    perform app.raise('already_member', 'That person is already a member');
  end if;
  if app.member_limit_reached(p_organisation_id, true) then
    perform app.raise('member_limit_reached',
      'Companies with five or fewer assets can have up to five member logins. Driver profiles are unlimited.');
  end if;

  insert into public.invitations (organisation_id, email, role, token_hash, invited_by)
  values (p_organisation_id, lower(btrim(p_email)), p_role, extensions.digest(v_token, 'sha256'), auth.uid())
  returning id, invitations.expires_at into v_id, v_exp;

  return query select v_id, v_token, v_exp;
end $$;

create or replace function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org from public.invitations where id = p_invitation_id;
  if v_org is null then
    perform app.raise('not_found', 'Invitation not found');
  end if;
  perform app.require_capability(v_org, 'org.members.manage');
  update public.invitations set revoked_at = now()
  where id = p_invitation_id and accepted_at is null and revoked_at is null;
end $$;

-- Accept an invitation addressed to the signed-in person's verified email.
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invitations%rowtype;
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    perform app.raise('not_authenticated', 'Sign in required');
  end if;
  select * into v_inv from public.invitations
  where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
  for update;

  if v_inv.id is null or v_inv.revoked_at is not null then
    perform app.raise('invitation_invalid', 'This invitation is not valid');
  end if;
  if v_inv.accepted_at is not null then
    perform app.raise('invitation_used', 'This invitation has already been used');
  end if;
  if v_inv.expires_at < now() then
    perform app.raise('invitation_expired', 'This invitation has expired');
  end if;

  select email into v_email from public.profiles where id = v_uid;
  if lower(v_email) <> lower(v_inv.email) then
    perform app.raise('invitation_email_mismatch', 'Sign in with the email address the invitation was sent to');
  end if;

  perform 1 from public.organisations where id = v_inv.organisation_id for update;
  if app.member_limit_reached(v_inv.organisation_id, false) then
    perform app.raise('member_limit_reached', 'This company has reached its member-login limit');
  end if;

  insert into public.org_memberships (organisation_id, user_id, role, invited_by)
  values (v_inv.organisation_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (organisation_id, user_id) do update
    set role = excluded.role, status = 'active', removed_at = null
    where public.org_memberships.status = 'removed';

  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.organisation_id;
end $$;

-- Owners/role holders the organisation must always keep.
create or replace function app.owner_role_for(p_kind public.organisation_kind) returns public.member_role
language sql immutable set search_path = '' as $$
  select case p_kind when 'company' then 'owner'::public.member_role
                     when 'marketplace_customer' then 'account_owner'::public.member_role
                     else 'provider_owner'::public.member_role end
$$;

create or replace function public.update_member_role(p_membership_id uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.org_memberships%rowtype;
  v_kind public.organisation_kind;
  v_owner public.member_role;
begin
  select * into v_m from public.org_memberships where id = p_membership_id;
  if v_m.id is null then
    perform app.raise('not_found', 'Member not found');
  end if;
  perform app.require_capability(v_m.organisation_id, 'org.members.manage');
  perform app.require_mfa_if_needed(v_m.organisation_id);

  select kind into v_kind from public.organisations where id = v_m.organisation_id for update;
  v_owner := app.owner_role_for(v_kind);

  if v_m.role = v_owner or p_role = v_owner then
    perform app.raise('ownership_change_not_supported', 'Ownership is changed through an ownership transfer, not a role change');
  end if;
  if v_m.user_id = auth.uid() then
    perform app.raise('cannot_change_own_role', 'You cannot change your own role');
  end if;

  update public.org_memberships set role = p_role where id = p_membership_id;

  -- Grants that are no longer valid for the new role are revoked.
  update public.membership_grants
  set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'Role changed to ' || p_role
  where membership_id = p_membership_id and revoked_at is null and not app.grant_valid_for_role(grant_type, p_role);

  perform app.security_event('member_role_changed', v_m.organisation_id,
    jsonb_build_object('membership_id', p_membership_id, 'from', v_m.role, 'to', p_role), auth.uid());
end $$;

create or replace function public.remove_member(p_membership_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.org_memberships%rowtype;
  v_kind public.organisation_kind;
begin
  select * into v_m from public.org_memberships where id = p_membership_id;
  if v_m.id is null or v_m.status = 'removed' then
    perform app.raise('not_found', 'Member not found');
  end if;
  perform app.require_capability(v_m.organisation_id, 'org.members.manage');
  perform app.require_mfa_if_needed(v_m.organisation_id);
  select kind into v_kind from public.organisations where id = v_m.organisation_id for update;
  if v_m.role = app.owner_role_for(v_kind) then
    perform app.raise('cannot_remove_owner', 'The account owner cannot be removed');
  end if;

  update public.org_memberships set status = 'removed', removed_at = now() where id = p_membership_id;
  update public.membership_grants
  set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = coalesce(p_reason, 'Member removed')
  where membership_id = p_membership_id and revoked_at is null;

  perform app.security_event('member_removed', v_m.organisation_id,
    jsonb_build_object('membership_id', p_membership_id, 'reason', p_reason), auth.uid());
end $$;

create or replace function public.assign_grant(
  p_membership_id uuid, p_grant public.member_grant,
  p_approval_limit_cents bigint default null, p_competency_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.org_memberships%rowtype;
  v_kind public.organisation_kind;
  v_id uuid;
begin
  select * into v_m from public.org_memberships where id = p_membership_id and status = 'active';
  if v_m.id is null then
    perform app.raise('not_found', 'Member not found');
  end if;
  perform app.require_capability(v_m.organisation_id, 'org.grants.assign');
  perform app.require_mfa_if_needed(v_m.organisation_id);

  select kind into v_kind from public.organisations where id = v_m.organisation_id;
  if v_kind <> 'company' then
    perform app.raise('grants_company_only', 'Grants apply to company organisations only');
  end if;
  if not app.grant_valid_for_role(p_grant, v_m.role) then
    perform app.raise('grant_not_valid_for_role', format('A %s cannot hold the %s grant', v_m.role, p_grant));
  end if;

  update public.membership_grants
  set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'Replaced'
  where membership_id = p_membership_id and grant_type = p_grant and revoked_at is null;

  insert into public.membership_grants (organisation_id, membership_id, grant_type, approval_limit_cents, competency_note, assigned_by)
  values (v_m.organisation_id, p_membership_id, p_grant,
          case when p_grant = 'approval_limit' then p_approval_limit_cents end,
          nullif(btrim(coalesce(p_competency_note, '')), ''), auth.uid())
  returning id into v_id;

  perform app.security_event('grant_assigned', v_m.organisation_id,
    jsonb_build_object('membership_id', p_membership_id, 'grant', p_grant, 'approval_limit_cents', p_approval_limit_cents), auth.uid());
  return v_id;
end $$;

create or replace function public.revoke_grant(p_grant_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_g public.membership_grants%rowtype;
begin
  select * into v_g from public.membership_grants where id = p_grant_id and revoked_at is null;
  if v_g.id is null then
    perform app.raise('not_found', 'Grant not found');
  end if;
  perform app.require_capability(v_g.organisation_id, 'org.grants.assign');
  perform app.require_mfa_if_needed(v_g.organisation_id);
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'A reason is required');
  end if;
  update public.membership_grants set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason where id = p_grant_id;
  perform app.security_event('grant_revoked', v_g.organisation_id,
    jsonb_build_object('grant_id', p_grant_id, 'grant', v_g.grant_type, 'reason', p_reason), auth.uid());
end $$;

-- Time-limited, logged support access (SoW §2.3, §2.6). Visible to the Owner.
create or replace function public.start_support_access(p_organisation_id uuid, p_reason text, p_minutes integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_max integer := app.setting_int('support_access.max_minutes');
begin
  if not app.is_platform_staff(array['platform_administrator', 'support_agent']::public.platform_role[]) then
    perform app.raise('forbidden', 'HVEMS staff with MFA only');
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > v_max then
    perform app.raise('invalid_duration', format('Support access can last between 1 and %s minutes', v_max));
  end if;
  insert into public.support_access_grants (staff_user_id, organisation_id, reason, expires_at)
  values (auth.uid(), p_organisation_id, btrim(p_reason), now() + make_interval(mins => p_minutes))
  returning id into v_id;
  perform app.security_event('support_access_started', p_organisation_id,
    jsonb_build_object('grant_id', v_id, 'minutes', p_minutes, 'reason', p_reason), auth.uid());
  return v_id;
end $$;

create or replace function public.end_support_access(p_grant_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  update public.support_access_grants set ended_at = now()
  where id = p_grant_id and staff_user_id = auth.uid() and ended_at is null
  returning organisation_id into v_org;
  if v_org is not null then
    perform app.security_event('support_access_ended', v_org, jsonb_build_object('grant_id', p_grant_id), auth.uid());
  end if;
end $$;

-- Function privileges: RPCs need a signed-in user; helpers are internal.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_organisation(public.organisation_kind, text, text),
  public.my_contexts(),
  public.my_capabilities(uuid),
  public.my_staff_context(),
  public.create_invitation(uuid, text, public.member_role),
  public.revoke_invitation(uuid),
  public.accept_invitation(text),
  public.update_member_role(uuid, public.member_role),
  public.remove_member(uuid, text),
  public.assign_grant(uuid, public.member_grant, bigint, text),
  public.revoke_grant(uuid, text),
  public.start_support_access(uuid, text, integer),
  public.end_support_access(uuid)
to authenticated;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
