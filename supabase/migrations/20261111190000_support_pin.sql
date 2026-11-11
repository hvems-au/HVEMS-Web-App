-- Decisions (11 Nov 2026, Ahmad):
-- 1. Support PIN: a 6-digit PIN in each company's Settings → Security (Owner
--    and Company Admins). It changes every few hours (setting, 4) and HVEMS
--    support must enter it to open a support session. 5 wrong PINs lock that
--    staff member out of that company for 15 minutes. The PIN is derived from a
--    per-company secret that nobody can read; "New PIN now" replaces the secret.
-- 2. Expired driver credentials only warn: Company Admins now get the alerts too.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('support_access.pin_rotation_hours', '4', 'Hours each company support PIN stays the same', 'confirmed', 'ADM-07'),
  ('support_access.pin_max_attempts', '5', 'Wrong support PINs before HVEMS staff are locked out of that company', 'confirmed', 'ADM-07'),
  ('support_access.pin_lockout_minutes', '15', 'Minutes the support PIN lock lasts', 'confirmed', 'ADM-07')
on conflict (key) do nothing;

create table public.org_support_pin_secrets (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  secret bytea not null default extensions.gen_random_bytes(32),
  rotated_at timestamptz not null default now(),
  rotated_by uuid references auth.users (id) on delete set null
);
create index org_support_pin_secrets_rotated_by_idx on public.org_support_pin_secrets (rotated_by);
comment on table public.org_support_pin_secrets is 'Per-company secret behind the rotating support PIN. Reached only through functions.';
alter table public.org_support_pin_secrets enable row level security;
revoke all on public.org_support_pin_secrets from anon, authenticated;

create or replace function app.support_pin_window() returns bigint
language sql stable security definer set search_path = '' as $$
  select floor(extract(epoch from now()) / (greatest(coalesce(app.setting_int('support_access.pin_rotation_hours'), 4), 1) * 3600))::bigint
$$;

-- The PIN for an organisation in a time window (creates the secret on first use).
create or replace function app.support_pin(p_org uuid, p_window bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_secret bytea;
begin
  insert into public.org_support_pin_secrets (organisation_id) values (p_org) on conflict do nothing;
  select secret into v_secret from public.org_support_pin_secrets where organisation_id = p_org;
  return lpad((abs(('x' || substr(encode(extensions.hmac(convert_to(p_window::text, 'UTF8'), v_secret, 'sha256'), 'hex'), 1, 8))::bit(32)::bigint)
    % 1000000)::text, 6, '0');
end $$;

-- Owner / Company Admin: the current PIN and when it changes.
create or replace function public.my_support_pin(p_organisation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_window bigint := app.support_pin_window();
  v_hours integer := greatest(coalesce(app.setting_int('support_access.pin_rotation_hours'), 4), 1);
begin
  perform app.require_capability(p_organisation_id, 'org.settings.manage');
  return jsonb_build_object('pin', app.support_pin(p_organisation_id, v_window),
    'valid_until', to_timestamp((v_window + 1) * v_hours * 3600), 'rotation_hours', v_hours);
end $$;

-- Owner / Company Admin: replace the PIN straight away (e.g. after a support call).
create or replace function public.rotate_support_pin(p_organisation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_capability(p_organisation_id, 'org.settings.manage');
  insert into public.org_support_pin_secrets (organisation_id, rotated_by) values (p_organisation_id, auth.uid())
  on conflict (organisation_id) do update set secret = extensions.gen_random_bytes(32), rotated_at = now(), rotated_by = auth.uid();
  perform app.security_event('support_pin_changed', p_organisation_id, '{}'::jsonb, auth.uid());
  return public.my_support_pin(p_organisation_id);
end $$;

-- HVEMS staff open a read-only session: now needs the company's current PIN.
-- Wrong PINs are returned (not raised) so the attempt, which drives the lock, is kept.
drop function public.start_support_access(uuid, text, integer);
create or replace function public.start_support_access(p_organisation_id uuid, p_reason text, p_minutes integer, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_max integer := coalesce(app.setting_int('support_access.max_minutes'), 60);
  v_tries integer := coalesce(app.setting_int('support_access.pin_max_attempts'), 5);
  v_lock integer := coalesce(app.setting_int('support_access.pin_lockout_minutes'), 15);
  v_last_ok bigint;
  v_failed integer;
  v_staff text;
begin
  if not app.is_platform_staff(array['platform_administrator', 'support_agent']::public.platform_role[]) then
    perform app.raise('forbidden', 'HVEMS staff with MFA only');
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > v_max then
    perform app.raise('invalid_duration', format('Support access can last between 1 and %s minutes', v_max));
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    perform app.raise('reason_required', 'Give the reason for support access (at least 10 characters)');
  end if;
  if exists (select 1 from public.support_access_grants where staff_user_id = auth.uid() and organisation_id = p_organisation_id
             and ended_at is null and expires_at > now()) then
    perform app.raise('already_active', 'You already have an active support session for this organisation');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('support_pin:' || auth.uid()::text || ':' || p_organisation_id::text, 0));
  select max(id) into v_last_ok from public.security_events
  where user_id = auth.uid() and organisation_id = p_organisation_id and event_type = 'support_access_started';
  select count(*) into v_failed from public.security_events
  where user_id = auth.uid() and organisation_id = p_organisation_id and event_type = 'support_pin_failed'
    and occurred_at > now() - make_interval(mins => v_lock) and (v_last_ok is null or id > v_last_ok);
  if v_failed >= v_tries then
    return jsonb_build_object('ok', false, 'code', 'pin_locked',
      'message', format('Too many wrong PINs for this company. Try again in %s minutes.', v_lock));
  end if;
  if coalesce(btrim(p_pin), '') <> app.support_pin(p_organisation_id, app.support_pin_window()) then
    perform app.security_event('support_pin_failed', p_organisation_id, '{}'::jsonb, auth.uid());
    return jsonb_build_object('ok', false, 'code', 'invalid_pin',
      'message', 'That support PIN is not right. Ask the company''s Owner or Company Admin for the current PIN (Settings → Security).');
  end if;

  insert into public.support_access_grants (staff_user_id, organisation_id, reason, expires_at)
  values (auth.uid(), p_organisation_id, btrim(p_reason), now() + make_interval(mins => p_minutes))
  returning id into v_id;
  perform app.security_event('support_access_started', p_organisation_id,
    jsonb_build_object('grant_id', v_id, 'minutes', p_minutes, 'reason', btrim(p_reason)), auth.uid());

  select coalesce(nullif(full_name, ''), email::text) into v_staff from public.profiles where id = auth.uid();
  insert into public.notifications (organisation_id, recipient_id, kind, title, body)
  select p_organisation_id, m.user_id, 'support_access_started',
         format('HVEMS support (%s) can view your records for %s minutes', coalesce(v_staff, 'HVEMS staff'), p_minutes),
         format('Reason: %s. Read-only. You can end it from the Team page.', btrim(p_reason))
  from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.status = 'active'
    and exists (select 1 from app.role_capabilities rc where rc.role = m.role and rc.capability = 'support_access.view');
  return jsonb_build_object('ok', true, 'grant_id', v_id);
end $$;

revoke execute on function app.support_pin(uuid, bigint), app.support_pin_window() from public, anon, authenticated;
revoke execute on function public.my_support_pin(uuid), public.rotate_support_pin(uuid), public.start_support_access(uuid, text, integer, text) from public, anon;
grant execute on function public.my_support_pin(uuid), public.rotate_support_pin(uuid), public.start_support_access(uuid, text, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Expired credentials: warn the Owner, Fleet Managers and Company Admins.
-- ---------------------------------------------------------------------------
create or replace function app.notify_credential_expiry() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_warn integer := coalesce(app.setting_int('drivers.credential_warning_days'), 30);
  v_count integer := 0;
  r record;
begin
  for r in
    select c.id, c.organisation_id, c.kind, c.label, c.expires_on, c.warned_at, c.expired_notified_at, d.full_name
    from public.driver_credentials c
    join public.driver_profiles d on d.id = c.driver_id and d.active
    where c.expires_on is not null
      and ((c.expires_on < v_today and c.expired_notified_at is null)
        or (c.expires_on >= v_today and c.expires_on <= v_today + v_warn and c.warned_at is null))
  loop
    if r.expires_on < v_today then
      perform app.notify(r.organisation_id, 'credential_expired',
        format('%s''s %s has expired', r.full_name, app.credential_label(r.kind, r.label)),
        format('It expired on %s. Update it on the Drivers page once renewed.', to_char(r.expires_on, 'DD/MM/YYYY')), null, true);
      update public.driver_credentials set expired_notified_at = now(), warned_at = coalesce(warned_at, now()) where id = r.id;
    else
      perform app.notify(r.organisation_id, 'credential_expiring',
        format('%s''s %s expires on %s', r.full_name, app.credential_label(r.kind, r.label), to_char(r.expires_on, 'DD/MM/YYYY')),
        'Update it on the Drivers page once renewed.', null, true);
      update public.driver_credentials set warned_at = now() where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
