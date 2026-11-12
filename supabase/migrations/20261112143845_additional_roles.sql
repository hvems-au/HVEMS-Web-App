-- One person, several roles. A membership keeps its main role (org_memberships.role)
-- and may hold additional roles (for example a Fleet Manager who is also a
-- Technician, or an Owner who also operates equipment). Permissions are the union
-- of every role plus grants. MFA and alert rules count every role.
-- * Additional roles must suit the organisation type, can't be an owner role and
--   can't repeat the main role. Changed by members with org.members.manage (not
--   on yourself), audited (org_memberships audit trigger + security event).
-- * Changing the main role drops it from the additional roles.

alter table public.org_memberships add column additional_roles public.member_role[] not null default '{}';
comment on column public.org_memberships.additional_roles is 'Roles held besides the main role; permissions are the union.';

-- Every role a membership holds.
create or replace function app.membership_roles(m public.org_memberships) returns public.member_role[]
language sql immutable set search_path = '' as $$
  select array[m.role] || coalesce(m.additional_roles, '{}')
$$;

create or replace function app.orgs_with_capability(p_capability text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.organisation_id), '{}')
  from public.org_memberships m
  join public.organisations o on o.id = m.organisation_id and o.status <> 'closed'
  where m.user_id = auth.uid()
    and m.status = 'active'
    and (
      exists (select 1 from app.role_capabilities rc where rc.role = any (app.membership_roles(m)) and rc.capability = p_capability)
      or exists (
        select 1 from public.membership_grants g
        join app.grant_capabilities gc on gc.grant_type = g.grant_type and gc.capability = p_capability
        where g.membership_id = m.id and g.revoked_at is null
      )
    )
$$;

create or replace function public.my_capabilities(p_organisation_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct cap order by cap), '{}') from (
    select rc.capability as cap
    from public.org_memberships m
    join public.organisations o on o.id = m.organisation_id and o.status <> 'closed'
    join app.role_capabilities rc on rc.role = any (app.membership_roles(m))
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

create or replace function app.alert_recipients(p_org uuid, p_include_admins boolean) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.org_memberships m
  where m.organisation_id = p_org and m.status = 'active'
    and (app.membership_roles(m) && array['owner', 'fleet_manager']::public.member_role[]
         or (p_include_admins and 'administrator' = any (app.membership_roles(m))))
$$;

create or replace function app.mfa_required(p_organisation_id uuid, p_user_id uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  with m as (
    select om.id, app.membership_roles(om) as roles from public.org_memberships om
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
      when m.roles && array['owner', 'administrator', 'finance']::public.member_role[] then f.members >= 2 or f.has_pm
      when 'provider_owner' = any (m.roles) then f.has_pm
      else false
    end
    from m, facts f
  ), false)
$$;

-- Set a member's additional roles (replaces the list).
create or replace function public.set_member_additional_roles(p_membership_id uuid, p_roles public.member_role[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.org_memberships%rowtype;
  v_kind public.organisation_kind;
  v_roles public.member_role[] := array(select distinct r from unnest(coalesce(p_roles, '{}')) r);
  r public.member_role;
begin
  select * into v_m from public.org_memberships where id = p_membership_id for update;
  if v_m.id is null then
    perform app.raise('not_found', 'Member not found');
  end if;
  perform app.require_capability(v_m.organisation_id, 'org.members.manage');
  perform app.require_mfa_if_needed(v_m.organisation_id);
  if v_m.user_id = auth.uid() then
    perform app.raise('cannot_change_own_role', 'You cannot change your own roles');
  end if;
  if exists (select 1 from public.driver_profiles d where d.membership_id = v_m.id) then
    perform app.raise('operator_profile_roles', 'Operator ID accounts only operate equipment. Invite the person by email to give them other roles.');
  end if;
  select kind into v_kind from public.organisations where id = v_m.organisation_id;
  foreach r in array v_roles loop
    if r = v_m.role then
      perform app.raise('role_already_main', 'That is already their main role');
    end if;
    if r in ('owner', 'account_owner', 'provider_owner') or not app.role_valid_for_kind(r, v_kind) then
      perform app.raise('role_not_valid_for_account_type', 'That role cannot be added for this account');
    end if;
  end loop;
  update public.org_memberships set additional_roles = v_roles where id = v_m.id;
  perform app.security_event('member_roles_changed', v_m.organisation_id,
    jsonb_build_object('membership_id', v_m.id, 'main', v_m.role, 'from', v_m.additional_roles, 'to', v_roles), auth.uid());
end $$;
revoke execute on function public.set_member_additional_roles(uuid, public.member_role[]) from public, anon;
grant execute on function public.set_member_additional_roles(uuid, public.member_role[]) to authenticated, service_role;

-- A main-role change drops that role from the additional roles.
create or replace function app.memberships_tidy_roles() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.additional_roles := array(select distinct r from unnest(coalesce(new.additional_roles, '{}')) r where r <> new.role);
  return new;
end $$;
create trigger org_memberships_tidy_roles before insert or update of role, additional_roles on public.org_memberships
  for each row execute function app.memberships_tidy_roles();
