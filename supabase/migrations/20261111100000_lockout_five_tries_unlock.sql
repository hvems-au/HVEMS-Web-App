-- Decision O-11 (11 Nov 2026, Ahmad): stricter sign-in rules and unlocking.
-- * Lock after 5 wrong passwords (was 10); show the tries left from the 3rd.
-- * Portal idle timeout 3 hours (was 12). The console stays at 30 minutes.
-- * The Owner and Company Admins can clear a member's wrong-password count or
--   lock; the Super Admin can do it for anyone. Each unlock is a security event.

update public.platform_settings set value = '5', sow_reference = '§2.5 CFG-45, O-11', status = 'confirmed'
where key = 'security.password_max_attempts';
update public.platform_settings set value = '180', sow_reference = '§2.5 CFG-45, O-11', status = 'confirmed'
where key = 'security.idle_timeout_minutes_portal';
insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('security.password_warn_after_attempts', '3', 'Wrong passwords after which the sign-in page shows the tries left', 'confirmed', 'O-11')
on conflict (key) do nothing;

-- Same rules as before; the result now also says how many wrong passwords there
-- have been and whether to show the tries left.
create or replace function public.record_password_sign_in(p_email text, p_success boolean, p_portal text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email extensions.citext := lower(btrim(coalesce(p_email, '')))::extensions.citext;
  v_max integer := coalesce(app.setting_int('security.password_max_attempts'), 5);
  v_lock integer := coalesce(app.setting_int('security.password_lockout_minutes'), 15);
  v_window integer := coalesce(app.setting_int('security.password_failure_window_minutes'), 1440);
  v_warn integer := coalesce(app.setting_int('security.password_warn_after_attempts'), 3);
  v_user uuid;
  l public.password_lockouts%rowtype;
begin
  if v_email = '' then
    return jsonb_build_object('locked', false);
  end if;
  select id into v_user from auth.users where lower(email) = v_email::text limit 1;

  if p_success then
    delete from public.password_lockouts where email = v_email;
    return jsonb_build_object('locked', false);
  end if;

  insert into public.password_lockouts (email) values (v_email) on conflict (email) do nothing;
  select * into l from public.password_lockouts where email = v_email for update;

  if l.locked_until > now() then
    return jsonb_build_object('locked', true, 'locked_until', l.locked_until);
  end if;
  if l.locked_until is not null or l.last_failed_at < now() - make_interval(mins => v_window) then
    l.failed_count := 0;
  end if;

  l.failed_count := l.failed_count + 1;
  l.last_failed_at := now();
  l.locked_until := case when l.failed_count >= v_max then now() + make_interval(mins => v_lock) end;
  update public.password_lockouts
  set failed_count = l.failed_count, last_failed_at = l.last_failed_at, locked_until = l.locked_until
  where email = v_email;

  perform app.security_event('password_sign_in_failed', null,
    jsonb_build_object('portal', p_portal, 'failed_count', l.failed_count)
      || case when v_user is null then jsonb_build_object('email', v_email::text) else '{}'::jsonb end,
    v_user);
  if l.locked_until is not null then
    perform app.security_event('account_locked', null,
      jsonb_build_object('portal', p_portal, 'until', l.locked_until, 'minutes', v_lock)
        || case when v_user is null then jsonb_build_object('email', v_email::text) else '{}'::jsonb end,
      v_user);
  end if;
  return jsonb_build_object('locked', l.locked_until is not null, 'locked_until', l.locked_until,
    'failed_count', l.failed_count, 'remaining', greatest(v_max - l.failed_count, 0),
    'show_remaining', l.failed_count >= v_warn, 'lockout_minutes', v_lock);
end $$;

-- ---------------------------------------------------------------------------
-- Who in an organisation has wrong passwords or a lock (Team page)
-- ---------------------------------------------------------------------------
create or replace function public.member_sign_in_locks(p_organisation_id uuid)
returns table (membership_id uuid, failed_count integer, locked_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select om.id, l.failed_count, case when l.locked_until > now() then l.locked_until end
  from public.org_memberships om
  join auth.users u on u.id = om.user_id
  join public.password_lockouts l on l.email = lower(u.email)::extensions.citext
  where om.organisation_id = p_organisation_id and om.status <> 'removed'
    and (p_organisation_id = any (app.orgs_with_capability('org.members.manage'))
         or app.is_platform_staff(array['platform_administrator']::public.platform_role[]))
    and (l.locked_until > now()
         or l.last_failed_at > now() - make_interval(mins => coalesce(app.setting_int('security.password_failure_window_minutes'), 1440)))
$$;

-- Owner / Company Admin: clear a member's wrong passwords or lock.
create or replace function public.unlock_member_sign_in(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.org_memberships%rowtype;
  v_email text;
begin
  select * into v_m from public.org_memberships where id = p_membership_id;
  if v_m.id is null or v_m.status = 'removed' then
    perform app.raise('not_found', 'Member not found');
  end if;
  perform app.require_capability(v_m.organisation_id, 'org.members.manage');
  perform app.require_mfa_if_needed(v_m.organisation_id);
  select lower(email) into v_email from auth.users where id = v_m.user_id;
  delete from public.password_lockouts where email = v_email::extensions.citext;
  perform app.security_event('sign_in_unlocked', v_m.organisation_id,
    jsonb_build_object('membership_id', v_m.id, 'member_user_id', v_m.user_id), auth.uid());
end $$;

-- Super Admin: clear anyone's wrong passwords or lock.
create or replace function public.admin_unlock_sign_in(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Super Admin signed in with MFA can unlock sign-in');
  end if;
  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null then
    perform app.raise('not_found', 'User not found');
  end if;
  delete from public.password_lockouts where email = v_email::extensions.citext;
  insert into public.security_events (user_id, organisation_id, event_type, detail)
  select auth.uid(), om.organisation_id, 'hvems_staff_sign_in_unlocked', jsonb_build_object('member_user_id', p_user_id)
  from public.org_memberships om where om.user_id = p_user_id and om.status <> 'removed';
  perform app.security_event('hvems_staff_sign_in_unlocked', null, jsonb_build_object('member_user_id', p_user_id), auth.uid());
end $$;

revoke execute on function public.member_sign_in_locks(uuid), public.unlock_member_sign_in(uuid), public.admin_unlock_sign_in(uuid) from public, anon;
grant execute on function public.member_sign_in_locks(uuid), public.unlock_member_sign_in(uuid), public.admin_unlock_sign_in(uuid) to authenticated, service_role;
