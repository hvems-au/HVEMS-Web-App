-- MFA recovery codes, MFA reset and "MFA for everyone" (ACC-03, ACC-15,
-- reconciliation §3 item 9, decision O-06).
--
-- * Each user can hold 10 single-use recovery codes, stored as bcrypt hashes
--   and shown only once. Using one lets the person remove their lost
--   authenticator and set up a new one. 5 wrong codes lock recovery for 15 min.
-- * An Owner or Company Admin can reset a member's MFA (not the Owner's, not
--   their own). A Super Admin can reset anyone's, with a reason.
-- * These functions only decide and record. The authenticator itself is
--   removed by the server through the Supabase Auth admin API, for the user id
--   the database returns.
-- * security.mfa_required_for_all (off) makes MFA required for every member
--   login. Driver ID + PIN profiles are not member logins (O-10) and stay out.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('security.mfa_required_for_all', 'false', 'Require MFA for every member login, whatever the role or account state (driver PIN profiles excluded)', 'confirmed', 'O-06'),
  ('security.mfa_recovery_code_count', '10', 'Recovery codes issued to each user', 'confirmed', 'ACC-03'),
  ('security.mfa_recovery_max_attempts', '5', 'Wrong recovery codes before recovery is locked', 'recommended', 'ACC-03'),
  ('security.mfa_recovery_lockout_minutes', '15', 'Minutes recovery stays locked after too many wrong codes', 'recommended', 'ACC-03')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- MFA rule (SoW §2.5) plus the O-06 switch
-- ---------------------------------------------------------------------------
create or replace function app.mfa_required(p_organisation_id uuid, p_user_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
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
      when exists (select 1 from public.driver_profiles d where d.membership_id = m.id) then false
      when f.for_all then true
      when m.role in ('owner', 'administrator', 'finance') then f.members >= 2 or f.has_pm
      when m.role = 'provider_owner' then f.has_pm
      else false
    end
    from m, facts f
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Recovery codes
-- ---------------------------------------------------------------------------
create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id) where used_at is null;
comment on table public.mfa_recovery_codes is 'Single-use MFA recovery codes (bcrypt hashes). Reached only through RPCs.';

alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;
-- No policies: the table is read and written only by the functions below.

-- XXXXX-XXXXX from 31 unambiguous characters (no 0/O, 1/I/L).
create or replace function app.new_recovery_code() returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_out text := '';
begin
  for i in 0..9 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
  end loop;
  return substr(v_out, 1, 5) || '-' || substr(v_out, 6, 5);
end $$;

-- Typed form people enter: case, spaces and dashes don't matter.
create or replace function app.normalise_recovery_code(p_code text) returns text language sql immutable set search_path = '' as $$
  select case when length(c) = 10 then substr(c, 1, 5) || '-' || substr(c, 6, 5) else c end
  from (select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') as c) x
$$;

-- New set of codes for the signed-in user; any earlier codes stop working.
-- Needs an MFA session, so only the authenticator's holder can create them.
create or replace function public.generate_mfa_recovery_codes() returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := coalesce(app.setting_int('security.mfa_recovery_code_count'), 10);
  v_codes text[] := '{}';
  v_code text;
begin
  if v_uid is null then
    perform app.raise('not_authenticated', 'Please sign in again');
  end if;
  if coalesce(app.jwt_aal(), 'aal1') <> 'aal2' then
    perform app.raise('mfa_required', 'Verify with your authenticator app before creating recovery codes');
  end if;
  delete from public.mfa_recovery_codes where user_id = v_uid;
  while coalesce(array_length(v_codes, 1), 0) < v_count loop
    v_code := app.new_recovery_code();
    if not v_code = any (v_codes) then
      v_codes := v_codes || v_code;
      insert into public.mfa_recovery_codes (user_id, code_hash) values (v_uid, extensions.crypt(v_code, extensions.gen_salt('bf', 8)));
    end if;
  end loop;
  perform app.security_event('mfa_recovery_codes_generated', null, jsonb_build_object('count', v_count), v_uid);
  return v_codes;
end $$;

-- How many unused codes the signed-in user has, and when they were created.
create or replace function public.my_mfa_recovery_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'remaining', count(*) filter (where used_at is null),
    'generated_at', min(created_at))
  from public.mfa_recovery_codes where user_id = auth.uid()
$$;

-- Use a recovery code. Returns {ok, code, message}; failures are returned, not
-- raised, so the failed attempt (which drives the lock) is kept.
-- On ok the caller's server removes the user's authenticators so a new one can be set up.
create or replace function public.use_mfa_recovery_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_max integer := coalesce(app.setting_int('security.mfa_recovery_max_attempts'), 5);
  v_lock integer := coalesce(app.setting_int('security.mfa_recovery_lockout_minutes'), 15);
  v_code text := app.normalise_recovery_code(p_code);
  v_failed integer;
  v_last_used bigint;
  v_id uuid;
begin
  if v_uid is null then
    perform app.raise('not_authenticated', 'Please sign in again');
  end if;
  -- One recovery at a time per user, so parallel guesses can't skip the count.
  perform pg_advisory_xact_lock(hashtextextended('mfa_recovery:' || v_uid::text, 0));

  -- Wrong codes since the last successful recovery, inside the lock window.
  select max(id) into v_last_used from public.security_events
  where user_id = v_uid and event_type = 'mfa_recovery_code_used';
  select count(*) into v_failed from public.security_events
  where user_id = v_uid and event_type = 'mfa_recovery_code_failed'
    and occurred_at > now() - make_interval(mins => v_lock)
    and (v_last_used is null or id > v_last_used);
  if v_failed >= v_max then
    return jsonb_build_object('ok', false, 'code', 'recovery_locked',
      'message', format('Too many wrong recovery codes. Try again in %s minutes.', v_lock));
  end if;

  select id into v_id from public.mfa_recovery_codes
  where user_id = v_uid and used_at is null and code_hash = extensions.crypt(v_code, code_hash)
  limit 1 for update;

  if v_id is null then
    perform app.security_event('mfa_recovery_code_failed', null, '{}'::jsonb, v_uid);
    return jsonb_build_object('ok', false, 'code', 'invalid_recovery_code',
      'message', 'That recovery code is not right or has already been used.');
  end if;

  update public.mfa_recovery_codes set used_at = now() where id = v_id;
  perform app.security_event('mfa_recovery_code_used', null,
    jsonb_build_object('remaining', (select count(*) from public.mfa_recovery_codes where user_id = v_uid and used_at is null)), v_uid);
  return jsonb_build_object('ok', true, 'user_id', v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- Resets
-- ---------------------------------------------------------------------------
-- Owner or Company Admin resets a member's MFA (lost phone, no codes left).
-- Returns the member's user id for the server to remove their authenticators.
create or replace function public.reset_member_mfa(p_membership_id uuid, p_reason text) returns uuid
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
  -- Changing someone else's sign-in security always needs your own MFA.
  if coalesce(app.jwt_aal(), 'aal1') <> 'aal2' then
    perform app.raise('mfa_required', 'Verify with your own authenticator app before resetting someone else''s');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for the reset');
  end if;
  if v_m.user_id = auth.uid() then
    perform app.raise('cannot_reset_own_mfa', 'Use one of your recovery codes to reset your own authenticator');
  end if;
  select kind into v_kind from public.organisations where id = v_m.organisation_id;
  if v_m.role = app.owner_role_for(v_kind) then
    perform app.raise('cannot_reset_owner_mfa', 'The Owner resets their authenticator with a recovery code, or through HVEMS support');
  end if;
  if exists (select 1 from public.driver_profiles d where d.membership_id = v_m.id) then
    perform app.raise('driver_profile', 'Drivers sign in with a PIN. Reset their PIN on the Drivers page');
  end if;

  delete from public.mfa_recovery_codes where user_id = v_m.user_id;
  perform app.security_event('member_mfa_reset', v_m.organisation_id,
    jsonb_build_object('membership_id', v_m.id, 'member_user_id', v_m.user_id, 'reason', btrim(p_reason)), auth.uid());
  return v_m.user_id;
end $$;

-- Super Admin resets anyone's MFA (for example an Owner with no codes left).
create or replace function public.admin_reset_user_mfa(p_user_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Super Admin signed in with MFA can reset someone''s MFA');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    perform app.raise('reason_required', 'Record how you confirmed the person''s identity (at least 10 characters)');
  end if;
  if p_user_id = auth.uid() then
    perform app.raise('cannot_reset_own_mfa', 'Use one of your recovery codes, or ask another Super Admin');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform app.raise('not_found', 'User not found');
  end if;

  delete from public.mfa_recovery_codes where user_id = p_user_id;
  -- Recorded against each organisation the person belongs to, so their Owners see it.
  insert into public.security_events (user_id, organisation_id, event_type, detail)
  select auth.uid(), om.organisation_id, 'hvems_staff_mfa_reset',
         jsonb_build_object('member_user_id', p_user_id, 'reason', btrim(p_reason))
  from public.org_memberships om where om.user_id = p_user_id and om.status <> 'removed';
  perform app.security_event('hvems_staff_mfa_reset', null,
    jsonb_build_object('member_user_id', p_user_id, 'reason', btrim(p_reason)), auth.uid());
  return p_user_id;
end $$;

revoke execute on function app.new_recovery_code(), app.normalise_recovery_code(text) from public, anon;
revoke execute on function public.generate_mfa_recovery_codes(), public.my_mfa_recovery_status(), public.use_mfa_recovery_code(text),
  public.reset_member_mfa(uuid, text), public.admin_reset_user_mfa(uuid, text) from public, anon;
grant execute on function public.generate_mfa_recovery_codes(), public.my_mfa_recovery_status(), public.use_mfa_recovery_code(text),
  public.reset_member_mfa(uuid, text), public.admin_reset_user_mfa(uuid, text) to authenticated, service_role;
