-- MFA enforcement switch (testing only).
-- Setting security.mfa_enforced (default true). When false, no MFA is required
-- anywhere: the company rule (Owner / Company Admin / Finance), "MFA for all",
-- and HVEMS staff access to the console all accept a password-only session.
-- Only for the development database; production keeps the default (true).
-- Identification in the audit history still records what was really used.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('security.mfa_enforced', 'true',
   'TESTING ONLY: false switches off every MFA requirement. Must stay true in production.',
   'recommended', 'Testing')
on conflict (key) do nothing;

create or replace function app.mfa_enforced() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'security.mfa_enforced'), true)
$$;
revoke execute on function app.mfa_enforced() from public, anon;
grant execute on function app.mfa_enforced() to authenticated, service_role;

-- MFA requirement for a member (company/provider rule).
create or replace function app.mfa_required(p_organisation_id uuid, p_user_id uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  with m as (
    select om.id, om.role from public.org_memberships om
    where om.organisation_id = p_organisation_id and om.user_id = coalesce(p_user_id, auth.uid()) and om.status = 'active'
  ),
  facts as (
    select
      (select count(*) from public.org_memberships om
       where om.organisation_id = p_organisation_id and om.status = 'active'
         and not exists (select 1 from public.driver_profiles d where d.membership_id = om.id)) as members,
      exists (select 1 from public.payment_methods where organisation_id = p_organisation_id and detached_at is null) as has_pm,
      coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'security.mfa_required_for_all'), false) as for_all
  )
  select coalesce((
    select case
      when not app.mfa_enforced() then false
      when exists (select 1 from public.driver_profiles d where d.membership_id = m.id) then false
      when f.for_all then true
      when m.role in ('owner', 'administrator', 'finance') then f.members >= 2 or f.has_pm
      when m.role = 'provider_owner' then f.has_pm
      else false
    end
    from m, facts f
  ), false)
$$;

-- Staff: an MFA session, unless enforcement is switched off.
create or replace function app.staff_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt_aal() = 'aal2', false) or not app.mfa_enforced()
$$;
revoke execute on function app.staff_mfa_ok() from public, anon;
grant execute on function app.staff_mfa_ok() to authenticated, service_role;

create or replace function app.is_platform_staff(p_roles public.platform_role[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.staff_mfa_ok() and exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.active
      and (p_roles is null or s.role = any (p_roles))
  )
$$;

create or replace function app.has_platform_authority(p_authority public.platform_authority) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.staff_mfa_ok() and exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.active
      and (s.role = 'platform_administrator' or p_authority = any (s.authorities))
  )
$$;

create or replace function public.my_staff_context()
returns table (role public.platform_role, authorities public.platform_authority[], mfa_satisfied boolean)
language sql stable security definer set search_path = '' as $$
  select s.role, s.authorities, app.staff_mfa_ok()
  from public.platform_staff s where s.user_id = auth.uid() and s.active
$$;

create or replace function app.require_mfa_if_needed(p_organisation_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.mfa_required(p_organisation_id) and coalesce(app.jwt_aal(), 'aal1') <> 'aal2' then
    perform app.raise('mfa_required', 'Multi-factor authentication is required for this action');
  end if;
end $$;
