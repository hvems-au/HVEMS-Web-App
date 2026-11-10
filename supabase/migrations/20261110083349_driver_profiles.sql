-- =============================================================================
-- Driver profiles and PIN sign-in (2B; CS-10, spec ACC-11/12)
--
-- * Managers (drivers.manage) create driver profiles: Driver ID D-0001… per
--   company, name, phone. Driver profiles do not count towards the free-tier
--   member-login limit (SoW §5.1).
-- * Each profile is linked to a login account created by the web server with
--   the service role (synthetic address, never shown) and a driver_operator
--   membership, so every existing RLS rule applies to drivers unchanged.
-- * First sign-in: Driver ID + one-time setup code (8 characters, 72 hours,
--   stored hashed) + a new 6-digit PIN. Afterwards: Driver ID + PIN.
--   5 wrong attempts lock the profile for 15 minutes (settings); a manager can
--   reset (new setup code) or deactivate it.
-- * Sign-in always starts from an equipment code (QR or typed), which tells
--   us the company. The web server checks the PIN through these service-role
--   functions and then opens a session for the linked account.
-- =============================================================================

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('drivers.setup_code_hours', '72', 'Hours a driver setup code stays valid', 'confirmed', 'ACC-11'),
  ('drivers.max_pin_attempts', '5', 'Wrong PIN attempts before a driver profile is locked', 'recommended', 'ACC-12'),
  ('drivers.lockout_minutes', '15', 'Minutes a driver profile stays locked after too many wrong PINs', 'recommended', 'ACC-12')
on conflict (key) do nothing;

create table public.driver_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_number integer not null check (driver_number > 0),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text check (phone is null or (char_length(phone) <= 40 and phone ~ '^[0-9 +()-]+$')),
  user_id uuid unique references auth.users (id) on delete set null,
  membership_id uuid,
  pin_hash text,
  setup_code_hash text,
  setup_expires_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_sign_in_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organisation_id, driver_number),
  unique (id, organisation_id),
  foreign key (membership_id, organisation_id) references public.org_memberships (id, organisation_id) on delete set null (membership_id)
);
create index driver_profiles_org_idx on public.driver_profiles (organisation_id);
create index driver_profiles_membership_org_idx on public.driver_profiles (membership_id, organisation_id);
create index driver_profiles_created_by_idx on public.driver_profiles (created_by);

alter table public.driver_profiles enable row level security;
-- Managers see their company's drivers; a driver sees their own profile. Secrets are never selectable.
create policy driver_profiles_read on public.driver_profiles for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]) or user_id = (select auth.uid()));
create policy driver_profiles_read_super_admin on public.driver_profiles for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
revoke all on public.driver_profiles from anon, authenticated;
grant select (id, organisation_id, driver_number, full_name, phone, user_id, membership_id, setup_expires_at,
  failed_attempts, locked_until, last_sign_in_at, active, created_at) on public.driver_profiles to authenticated;
create trigger audit_driver_profiles after insert or update or delete on public.driver_profiles
  for each row execute function app.audit_row_change('organisation_id');

-- Driver logins don't count towards the member-login limit (SoW §5.1: driver profiles are unlimited).
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
  select count(*) into members from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.status = 'active'
    and not exists (select 1 from public.driver_profiles d where d.membership_id = m.id);
  if p_include_pending then
    select count(*) into pending from public.invitations
    where organisation_id = p_organisation_id and accepted_at is null and revoked_at is null and expires_at > now();
  end if;
  return members + pending >= app.setting_int('free_tier.member_login_limit');
end $$;

create or replace function app.new_setup_code() returns text language sql volatile set search_path = '' as $$
  select substr(app.new_short_code(), 1, 8)
$$;

-- ---------------------------------------------------------------------------
-- Manager functions
-- ---------------------------------------------------------------------------
create or replace function public.create_driver_profile(p_organisation_id uuid, p_full_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_number integer;
  v_code text := app.new_setup_code();
  v_id uuid;
  v_exp timestamptz := now() + make_interval(hours => coalesce(app.setting_int('drivers.setup_code_hours'), 72));
begin
  perform app.require_capability(p_organisation_id, 'drivers.manage');
  if (select kind from public.organisations where id = p_organisation_id) <> 'company' then
    perform app.raise('company_only', 'Driver profiles belong to company organisations');
  end if;
  perform 1 from public.organisations where id = p_organisation_id for update;
  select coalesce(max(driver_number), 0) + 1 into v_number from public.driver_profiles where organisation_id = p_organisation_id;
  insert into public.driver_profiles (organisation_id, driver_number, full_name, phone, setup_code_hash, setup_expires_at, created_by)
  values (p_organisation_id, v_number, btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''),
          extensions.crypt(v_code, extensions.gen_salt('bf', 8)), v_exp, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'driver_number', v_number, 'setup_code', v_code, 'setup_expires_at', v_exp);
end $$;

-- New setup code (forgotten PIN or never set up); clears the PIN and the lock.
create or replace function public.reset_driver_setup(p_driver_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.driver_profiles%rowtype;
  v_code text := app.new_setup_code();
  v_exp timestamptz := now() + make_interval(hours => coalesce(app.setting_int('drivers.setup_code_hours'), 72));
begin
  select * into d from public.driver_profiles where id = p_driver_id for update;
  if d.id is null then
    perform app.raise('not_found', 'Driver not found');
  end if;
  perform app.require_capability(d.organisation_id, 'drivers.manage');
  update public.driver_profiles
  set pin_hash = null, setup_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 8)), setup_expires_at = v_exp,
      failed_attempts = 0, locked_until = null
  where id = d.id;
  insert into public.security_events (user_id, organisation_id, event_type, detail)
  values (d.user_id, d.organisation_id, 'driver_pin_reset', jsonb_build_object('driver_id', d.id, 'by', auth.uid()));
  return jsonb_build_object('driver_number', d.driver_number, 'setup_code', v_code, 'setup_expires_at', v_exp);
end $$;

create or replace function public.set_driver_active(p_driver_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.driver_profiles%rowtype;
begin
  select * into d from public.driver_profiles where id = p_driver_id for update;
  if d.id is null then
    perform app.raise('not_found', 'Driver not found');
  end if;
  perform app.require_capability(d.organisation_id, 'drivers.manage');
  update public.driver_profiles set active = p_active, failed_attempts = 0, locked_until = null where id = d.id;
  if d.membership_id is not null then
    update public.org_memberships set status = case when p_active then 'active' else 'suspended' end::public.membership_status
    where id = d.membership_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Service-role functions used by the web server
-- ---------------------------------------------------------------------------
-- Link the login account the server created for a new profile and give it the driver role.
create or replace function public.link_driver_account(p_driver_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.driver_profiles%rowtype;
  v_membership uuid;
begin
  select * into d from public.driver_profiles where id = p_driver_id for update;
  if d.id is null then
    perform app.raise('not_found', 'Driver not found');
  end if;
  if d.user_id is not null then
    return;
  end if;
  update public.profiles set full_name = d.full_name where id = p_user_id;
  insert into public.org_memberships (organisation_id, user_id, role, invited_by)
  values (d.organisation_id, p_user_id, 'driver_operator', d.created_by)
  returning id into v_membership;
  update public.driver_profiles set user_id = p_user_id, membership_id = v_membership where id = d.id;
end $$;

-- Check a Driver ID and PIN (or setup code + new PIN) for the company that owns
-- the scanned equipment. Returns the account to open a session for.
create or replace function public.driver_sign_in(
  p_code text, p_driver_number integer, p_secret text, p_new_pin text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.equipment_codes%rowtype;
  d public.driver_profiles%rowtype;
  v_ok boolean;
  v_max integer := coalesce(app.setting_int('drivers.max_pin_attempts'), 5);
  v_lock integer := coalesce(app.setting_int('drivers.lockout_minutes'), 15);
  v_setup boolean;
begin
  c := app.find_equipment_code(p_code);
  if c.id is null then
    perform app.raise('code_not_found', 'That equipment code is not valid');
  end if;
  select * into d from public.driver_profiles
  where organisation_id = c.organisation_id and driver_number = p_driver_number for update;
  if d.id is null or not d.active or d.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_credentials', 'message', 'Driver ID or PIN is not right');
  end if;
  if d.locked_until is not null and d.locked_until > now() then
    perform app.raise('driver_locked', format('Too many wrong attempts. Try again after %s or ask your manager to reset your PIN.',
      to_char(d.locked_until at time zone 'Australia/Brisbane', 'HH24:MI')));
  end if;

  v_setup := p_new_pin is not null;
  if v_setup then
    v_ok := d.setup_code_hash is not null and d.setup_expires_at > now()
            and d.setup_code_hash = extensions.crypt(upper(btrim(coalesce(p_secret, ''))), d.setup_code_hash);
  else
    v_ok := d.pin_hash is not null and d.pin_hash = extensions.crypt(coalesce(p_secret, ''), d.pin_hash);
  end if;

  if not v_ok then
    -- After an expired lock the count starts again.
    if d.locked_until is not null then
      d.failed_attempts := 0;
    end if;
    update public.driver_profiles
    set failed_attempts = d.failed_attempts + 1,
        locked_until = case when d.failed_attempts + 1 >= v_max then now() + make_interval(mins => v_lock) else null end
    where id = d.id;
    insert into public.security_events (user_id, organisation_id, event_type, detail)
    values (d.user_id, d.organisation_id, 'driver_sign_in_failed', jsonb_build_object('driver_id', d.id, 'setup', v_setup));
    -- Returned, not raised: raising would roll back the attempt count and the lock.
    return jsonb_build_object('ok', false,
      'code', case when not v_setup and d.pin_hash is null then 'pin_not_set' else 'invalid_credentials' end,
      'message', case when not v_setup and d.pin_hash is null then 'Set up your PIN first with the setup code from your manager'
                      when v_setup then 'Driver ID or setup code is not right, or the code has expired'
                      else 'Driver ID or PIN is not right' end);
  end if;

  if v_setup then
    if p_new_pin !~ '^\d{6}$' or p_new_pin ~ '^(\d)\1{5}$' or p_new_pin in ('123456', '654321', '012345', '123123') then
      perform app.raise('weak_pin', 'Choose a 6-digit PIN that isn''t easy to guess');
    end if;
    update public.driver_profiles
    set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)), setup_code_hash = null, setup_expires_at = null
    where id = d.id;
  end if;
  update public.driver_profiles set failed_attempts = 0, locked_until = null, last_sign_in_at = now() where id = d.id;
  insert into public.security_events (user_id, organisation_id, event_type, detail)
  values (d.user_id, d.organisation_id, case when v_setup then 'driver_pin_set' else 'driver_signed_in' end, jsonb_build_object('driver_id', d.id));
  return jsonb_build_object('ok', true, 'user_id', d.user_id, 'organisation_id', d.organisation_id, 'driver_id', d.id, 'full_name', d.full_name);
end $$;

revoke execute on function public.link_driver_account(uuid, uuid), public.driver_sign_in(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.link_driver_account(uuid, uuid), public.driver_sign_in(text, integer, text, text) to service_role;
revoke execute on function public.create_driver_profile(uuid, text, text), public.reset_driver_setup(uuid), public.set_driver_active(uuid, boolean) from public, anon;
grant execute on function public.create_driver_profile(uuid, text, text), public.reset_driver_setup(uuid), public.set_driver_active(uuid, boolean) to authenticated;
