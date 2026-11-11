-- Password lockout and idle timeouts (reconciliation §3 item 10, SoW §2.5, CFG-45, ADM-01).
--
-- * 10 wrong passwords in a row lock the account for 15 minutes. A successful
--   sign-in or a password reset clears the count; failures older than 24 hours
--   are forgotten. Unknown email addresses are counted the same way, so the
--   response never reveals whether an account exists.
-- * The functions are called only by the HVEMS server (service role) around
--   each password sign-in; signed-in users and anonymous visitors cannot call
--   them, so nobody can read or clear another person's lock.
-- * Idle timeouts are settings read by the web proxy: portals 12 hours, the
--   Super Admin console 30 minutes.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('security.password_max_attempts', '10', 'Wrong passwords in a row before an account is locked', 'confirmed', '§2.5 CFG-45'),
  ('security.password_lockout_minutes', '15', 'Minutes an account stays locked after too many wrong passwords', 'confirmed', '§2.5 CFG-45'),
  ('security.password_failure_window_minutes', '1440', 'Wrong passwords older than this are no longer counted', 'recommended', '§2.5'),
  ('security.idle_timeout_minutes_portal', '720', 'Minutes without activity before a portal session signs out (company, marketplace, provider, driver)', 'confirmed', '§2.5 CFG-45'),
  ('security.idle_timeout_minutes_console', '30', 'Minutes without activity before a Super Admin console session signs out', 'confirmed', 'ADM-01')
on conflict (key) do nothing;

create table public.password_lockouts (
  email extensions.citext primary key,
  failed_count integer not null default 0 check (failed_count >= 0),
  last_failed_at timestamptz,
  locked_until timestamptz
);
comment on table public.password_lockouts is 'Consecutive wrong passwords per email address. Server-only (service role) through the functions below.';
alter table public.password_lockouts enable row level security;
revoke all on public.password_lockouts from anon, authenticated;

-- Is this email address locked out right now?
create or replace function public.password_sign_in_status(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'locked', coalesce(l.locked_until > now(), false),
    'locked_until', case when l.locked_until > now() then l.locked_until end)
  from (select 1) x
  left join public.password_lockouts l on l.email = lower(btrim(coalesce(p_email, '')))::extensions.citext
$$;

-- Record the result of a password sign-in. Returns the lock state afterwards.
create or replace function public.record_password_sign_in(p_email text, p_success boolean, p_portal text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email extensions.citext := lower(btrim(coalesce(p_email, '')))::extensions.citext;
  v_max integer := coalesce(app.setting_int('security.password_max_attempts'), 10);
  v_lock integer := coalesce(app.setting_int('security.password_lockout_minutes'), 15);
  v_window integer := coalesce(app.setting_int('security.password_failure_window_minutes'), 1440);
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
    -- Already locked: the attempt is not checked against the password at all.
    return jsonb_build_object('locked', true, 'locked_until', l.locked_until);
  end if;
  -- A lock that has run out, or old failures, start the count again.
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
    'remaining', greatest(v_max - l.failed_count, 0));
end $$;

revoke execute on function public.password_sign_in_status(text), public.record_password_sign_in(text, boolean, text) from public, anon, authenticated;
grant execute on function public.password_sign_in_status(text), public.record_password_sign_in(text, boolean, text) to service_role;
