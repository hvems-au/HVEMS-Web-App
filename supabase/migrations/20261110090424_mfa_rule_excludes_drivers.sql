-- Driver profiles are not member logins (SoW §5.1: unlimited, Driver ID + PIN),
-- so they don't count towards the "2 or more members" MFA rule (SoW §2.5).
-- Without this, adding the first driver forced the Owner to set up MFA.
create or replace function app.mfa_required(p_organisation_id uuid, p_user_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  with m as (
    select role from public.org_memberships
    where organisation_id = p_organisation_id and user_id = coalesce(p_user_id, auth.uid()) and status = 'active'
  ),
  facts as (
    select
      (select count(*) from public.org_memberships om
       where om.organisation_id = p_organisation_id and om.status = 'active'
         and not exists (select 1 from public.driver_profiles d where d.membership_id = om.id)) as members,
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
