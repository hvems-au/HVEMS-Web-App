-- =============================================================================
-- HVEMS 2A — Foundation
-- Shared infrastructure every later migration relies on:
--   * private `app` schema for helper functions (not exposed through the API)
--   * enum types used across domains
--   * platform settings (SoW: "settings HVEMS can change without development")
--   * append-only audit history (CS-25, SoW §3.9) and security events
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists app;
comment on schema app is 'Private helper functions and reference tables. Not exposed through the Data API.';
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.organisation_kind as enum ('company', 'marketplace_customer', 'provider');

create type public.organisation_status as enum ('active', 'restricted', 'suspended', 'closing', 'closed');

create type public.member_role as enum (
  -- company organisation (SoW §2.4)
  'owner', 'administrator', 'fleet_manager', 'technician', 'driver_operator', 'finance', 'viewer',
  -- marketplace-only customer
  'account_owner', 'job_manager',
  -- provider account
  'provider_owner', 'provider_manager', 'provider_technician'
);

create type public.member_grant as enum ('clearance_authority', 'approval_limit', 'marketplace_buyer');

create type public.membership_status as enum ('active', 'suspended', 'removed');

create type public.platform_role as enum ('platform_administrator', 'support_agent');

create type public.platform_authority as enum ('verification_officer', 'billing_approver');

-- How a person identified themselves for an audited action (SoW §3.9).
create type public.identification_method as enum (
  'password', 'password_mfa', 'driver_pin', 'support_access', 'system', 'unverified'
);

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Authentication assurance level of the current request ('aal1' | 'aal2' | null).
create or replace function app.jwt_aal() returns text
language sql stable set search_path = '' as $$
  select auth.jwt() ->> 'aal'
$$;

create or replace function app.jwt_email() returns text
language sql stable set search_path = '' as $$
  select lower(auth.jwt() ->> 'email')
$$;

-- The identification method recorded against audited actions. Driver-PIN and
-- support-access flows set `app.identification_method` for their transaction.
create or replace function app.current_identification_method() returns public.identification_method
language plpgsql stable set search_path = '' as $$
declare
  v text := nullif(current_setting('app.identification_method', true), '');
begin
  if v is not null then
    return v::public.identification_method;
  end if;
  if auth.uid() is null then
    return 'system';
  end if;
  if app.jwt_aal() = 'aal2' then
    return 'password_mfa';
  end if;
  return 'password';
end $$;

-- Raise a structured application error. Clients map `code` to UI messages.
create or replace function app.raise(code text, message text, detail jsonb default '{}'::jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using
    errcode = 'P0001',
    message = message,
    detail = jsonb_build_object('code', code) || coalesce(detail, '{}'::jsonb),
    hint = code;
end $$;

-- ---------------------------------------------------------------------------
-- Platform settings
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  status text not null check (status in ('confirmed', 'recommended', 'to_be_confirmed', 'specialist_review')),
  sow_reference text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.platform_settings is
  'HVEMS-controlled settings (prices, limits, time windows). Changing a value is not a change request (SoW §12.5).';

create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function app.set_updated_at();

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('pricing.fleet_free_assets',            '5',      'Assets per company organisation that are always free',               'confirmed',   '§1.3 #8, §5.2'),
  ('pricing.fleet_per_asset_cents',        '3000',   'Monthly fleet subscription per asset above the free allowance (AUD cents, GST-inclusive)', 'confirmed', '§5.2'),
  ('pricing.provider_subscription_cents',  '9900',   'Monthly provider subscription per provider account (AUD cents)',     'confirmed',   '§5.3'),
  ('pricing.connection_fee_standard_cents','2900',   'Connection fee per liable party, standard job (AUD cents)',          'confirmed',   '§5.4'),
  ('pricing.connection_fee_urgent_cents',  '4900',   'Connection fee per liable party, urgent job (AUD cents)',            'confirmed',   '§5.4'),
  ('waivers.assets_per_waiver',            '10',     'Eligible assets per monthly company-side waiver',                    'confirmed',   '§5.5'),
  ('waivers.qualifying_days',              '14',     'Days an asset must be current before it counts towards waivers',     'confirmed',   '§5.5'),
  ('free_tier.member_login_limit',         '5',      'Member logins allowed while a company has five or fewer assets',     'confirmed',   '§5.2 D-05'),
  ('gst.registered',                       'false',  'Whether HVEMS is registered for GST',                                'confirmed',   '§5.9 D-01'),
  ('gst.registered_from',                  'null',   'Date GST registration takes effect (ISO date) when registered',      'confirmed',   '§5.9'),
  ('business.timezone',                    '"Australia/Brisbane"', 'Business calendar, billing month and waiver timezone', 'confirmed', '§1.3 #13'),
  ('security.driver_pin_max_attempts',     '5',      'Wrong PINs before a driver profile locks',                           'confirmed',   '§3.2'),
  ('security.driver_pin_lockout_minutes',  '15',     'Driver profile lockout duration',                                    'confirmed',   '§3.2'),
  ('support_access.max_minutes',           '240',    'Longest single support-access session HVEMS staff can open',         'recommended', '§2.3, §2.6'),
  ('billing.second_approval_threshold_cents', '50000', 'Refunds/credits above this need a second HVEMS approver',          'confirmed',   '§2.4, §5.8'),
  ('import.max_rows',                      '1000',   'Maximum rows per asset CSV import file',                             'confirmed',   '§3.1'),
  ('meter.max_km_per_day',                 '2000',   'Kilometres per day above which a reading is an implausible jump',     'recommended', '§3.1'),
  ('meter.max_hours_per_day',              '24',     'Engine hours per day above which a reading is an implausible jump',   'recommended', '§3.1'),
  ('defects.minor_repair_due_days',        '7',      'Default repair due period for Minor defects',                        'confirmed',   '§3.4 D-07'),
  ('defects.max_deferral_days',            '30',     'Deferral limit past the original due date',                          'confirmed',   '§3.4 D-07'),
  ('marketplace.standard_open_days',       '14',     'Days a standard job stays open',                                     'confirmed',   '§4.2'),
  ('marketplace.standard_extension_days',  '14',     'One-off extension for a standard job',                               'confirmed',   '§4.2'),
  ('marketplace.urgent_open_hours',        '24',     'Hours an urgent job stays open',                                     'confirmed',   '§4.2'),
  ('marketplace.proposal_validity_default_hours', '72', 'Default proposal validity, standard job',                         'confirmed',   '§4.4'),
  ('marketplace.urgent_proposal_validity_default_minutes', '60', 'Default proposal validity, urgent job',                 'confirmed',   '§4.4'),
  ('marketplace.provider_payment_window_standard_minutes', '240', 'Provider payment window for pending acceptances, standard', 'confirmed', '§4.5'),
  ('marketplace.provider_payment_window_urgent_minutes', '30', 'Provider payment window for pending acceptances, urgent',  'confirmed',   '§4.5');

-- ---------------------------------------------------------------------------
-- Audit history (append-only). SoW §3.9: no user or HVEMS staff member can edit
-- or delete these records through the platform.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  organisation_id uuid,
  actor_user_id uuid,
  actor_method public.identification_method not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changes jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb
);
create index audit_events_org_time_idx on public.audit_events (organisation_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_actor_idx on public.audit_events (actor_user_id, occurred_at desc);

create or replace function app.prevent_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit history is append-only (attempted % on %)', tg_op, tg_table_name
    using errcode = '42501';
end $$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function app.prevent_audit_mutation();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app.prevent_audit_mutation();

-- Write an explicit, domain-level audit event (approvals, clearances, exports…).
create or replace function app.audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_organisation_id uuid,
  p_changes jsonb default '{}'::jsonb, p_context jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (organisation_id, actor_user_id, actor_method, action, entity_type, entity_id, changes, context)
  values (p_organisation_id, auth.uid(), app.current_identification_method(), p_action, p_entity_type, p_entity_id,
          coalesce(p_changes, '{}'::jsonb), coalesce(p_context, '{}'::jsonb));
end $$;

-- Generic row-change audit trigger. TG_ARGV[0] (optional) = organisation column
-- name; TG_ARGV[1..] = columns to redact (e.g. token hashes).
create or replace function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org_col text := coalesce(nullif(tg_argv[0], ''), 'organisation_id');
  redact text[] := coalesce(tg_argv[1:], array[]::text[]);
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  diff jsonb := '{}'::jsonb;
  k text;
  org uuid;
  ent uuid;
begin
  foreach k in array redact loop
    old_j := case when old_j ? k then jsonb_set(old_j, array[k], '"[redacted]"') else old_j end;
    new_j := case when new_j ? k then jsonb_set(new_j, array[k], '"[redacted]"') else new_j end;
  end loop;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k not in ('updated_at') and (old_j -> k) is distinct from (new_j -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    diff := new_j;
  else
    diff := old_j;
  end if;

  org := coalesce((coalesce(new_j, old_j) ->> org_col)::uuid, null);
  ent := (coalesce(new_j, old_j) ->> 'id')::uuid;

  insert into public.audit_events (organisation_id, actor_user_id, actor_method, action, entity_type, entity_id, changes)
  values (org, auth.uid(), app.current_identification_method(), lower(tg_op), tg_table_name, ent, diff);

  return coalesce(new, old);
exception when invalid_text_representation then
  -- id column is not a uuid on this table; record without entity id
  insert into public.audit_events (organisation_id, actor_user_id, actor_method, action, entity_type, entity_id, changes)
  values (org, auth.uid(), app.current_identification_method(), lower(tg_op), tg_table_name, null, diff);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Security events (sign-in anomalies, PIN lockouts, role changes, support access)
-- ---------------------------------------------------------------------------
create table public.security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  organisation_id uuid,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb
);
create index security_events_org_time_idx on public.security_events (organisation_id, occurred_at desc);
create index security_events_user_time_idx on public.security_events (user_id, occurred_at desc);

create trigger security_events_no_update before update or delete on public.security_events
  for each row execute function app.prevent_audit_mutation();

create or replace function app.security_event(p_event_type text, p_organisation_id uuid, p_detail jsonb default '{}'::jsonb, p_user_id uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.security_events (user_id, organisation_id, event_type, detail)
  values (coalesce(p_user_id, auth.uid()), p_organisation_id, p_event_type, coalesce(p_detail, '{}'::jsonb));
$$;

-- Typed accessor for settings.
create or replace function app.setting_int(p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::integer from public.platform_settings where key = p_key
$$;

create or replace function app.setting_text(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select value #>> '{}' from public.platform_settings where key = p_key
$$;

-- Table privileges & RLS ------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.audit_events enable row level security;
alter table public.security_events enable row level security;

revoke all on public.platform_settings, public.audit_events, public.security_events from anon, authenticated;
grant select on public.platform_settings to authenticated;

create policy platform_settings_read on public.platform_settings
  for select to authenticated using (true);
-- audit_events / security_events SELECT policies are added in the identity migration,
-- once membership and capability helpers exist.

revoke execute on all functions in schema app from public, anon;
grant execute on function app.jwt_aal(), app.jwt_email(), app.current_identification_method() to authenticated, service_role;
