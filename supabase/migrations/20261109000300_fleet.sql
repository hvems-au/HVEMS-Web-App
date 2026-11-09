-- =============================================================================
-- HVEMS 2A — Equipment register, clients, sites, condition, meter readings
-- Scope: CS-07, CS-08, CS-09 (import), CS-14 (condition engine), CS-34 (consent
-- guard + asset-count history)
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create type public.asset_category as enum ('vehicle', 'equipment');
create type public.asset_owner_type as enum ('own', 'client_owned', 'hired_in');
create type public.meter_type as enum ('none', 'kilometres', 'hours', 'both');
create type public.meter_unit as enum ('km', 'hours');
create type public.asset_condition as enum ('active', 'needs_attention', 'out_of_service');
create type public.condition_cause_kind as enum (
  -- Broken/Out of service causes (SoW §3.4)
  'critical_defect', 'unverified_unsafe_report', 'critical_finding_awaiting_review',
  'out_of_service_hold', 'awaiting_return_to_service',
  -- Needs attention causes
  'minor_defect', 'needs_attention_hold', 'overdue_service'
);
create type public.meter_reading_status as enum ('accepted', 'pending_acceptance', 'rejected', 'superseded');
create type public.meter_reading_source as enum ('manual', 'inspection', 'work_order', 'import', 'onboarding');
create type public.asset_disposal as enum ('retired', 'sold', 'other');

create or replace function app.is_au_state(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p in ('QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT')
$$;

-- ---------------------------------------------------------------------------
-- Asset classes (platform reference data, SoW §3.1 asset categories)
-- `required_fields` drives class-specific mandatory fields (Recommended
-- defaults; HVEMS can change them without development).
-- ---------------------------------------------------------------------------
create table public.asset_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name text not null,
  category public.asset_category not null,
  default_meter_type public.meter_type not null,
  required_fields text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.asset_classes (code, name, category, default_meter_type, required_fields, sort_order) values
  ('prime_mover',              'Prime mover',                 'vehicle',   'kilometres', '{make,model,registration_number,registration_state,vin}', 10),
  ('rigid_truck',              'Rigid truck',                 'vehicle',   'kilometres', '{make,model,registration_number,registration_state,vin}', 20),
  ('trailer',                  'Trailer',                     'vehicle',   'none',       '{make,model,registration_number,registration_state,vin}', 30),
  ('bus',                      'Bus',                         'vehicle',   'kilometres', '{make,model,registration_number,registration_state,vin}', 40),
  ('light_vehicle',            'Light vehicle',               'vehicle',   'kilometres', '{make,model,registration_number,registration_state,vin}', 50),
  ('excavator',                'Excavator',                   'equipment', 'hours',      '{make,model,serial_number}', 60),
  ('loader',                   'Loader',                      'equipment', 'hours',      '{make,model,serial_number}', 70),
  ('dozer',                    'Dozer',                       'equipment', 'hours',      '{make,model,serial_number}', 80),
  ('grader',                   'Grader',                      'equipment', 'hours',      '{make,model,serial_number}', 90),
  ('other_mobile_plant',       'Other mobile plant',          'equipment', 'hours',      '{make,model,serial_number}', 100),
  ('portable_fixed_equipment', 'Portable or fixed equipment', 'equipment', 'none',       '{make,model}', 110);

-- ---------------------------------------------------------------------------
-- Clients and sites (private to their organisation; no client logins)
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  abn text check (abn is null or app.is_valid_abn(abn)),
  contact_name text,
  contact_email extensions.citext,
  contact_phone text,
  address text,
  notes text check (notes is null or char_length(notes) <= 5000),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index clients_org_name_uidx on public.clients (organisation_id, lower(name)) where archived_at is null;
create trigger clients_updated_at before update on public.clients for each row execute function app.set_updated_at();

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  client_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  address_line1 text,
  address_line2 text,
  suburb text,
  state text check (state is null or app.is_au_state(state)),
  postcode text check (postcode is null or postcode ~ '^\d{4}$'),
  timezone text not null default 'Australia/Brisbane',
  contact_name text,
  contact_phone text,
  contact_email extensions.citext,
  shift_times text check (shift_times is null or char_length(shift_times) <= 1000),
  access_instructions text check (access_instructions is null or char_length(access_instructions) <= 5000),
  safety_instructions text check (safety_instructions is null or char_length(safety_instructions) <= 5000),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (client_id, organisation_id) references public.clients (id, organisation_id)
);
create unique index sites_org_name_uidx on public.sites (organisation_id, lower(name)) where archived_at is null;
create index sites_client_idx on public.sites (client_id);
create trigger sites_updated_at before update on public.sites for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  asset_number text not null check (char_length(btrim(asset_number)) between 1 and 40),
  asset_class_id uuid not null references public.asset_classes (id),
  make text check (make is null or char_length(make) <= 100),
  model text check (model is null or char_length(model) <= 100),
  year smallint check (year is null or year between 1900 and 2100),
  registration_number text check (registration_number is null or char_length(registration_number) <= 20),
  registration_state text check (registration_state is null or app.is_au_state(registration_state)),
  vin text check (vin is null or char_length(vin) <= 40),
  serial_number text check (serial_number is null or char_length(serial_number) <= 60),
  owner_type public.asset_owner_type not null default 'own',
  client_id uuid,
  site_id uuid,
  responsible_membership_id uuid,
  meter_type public.meter_type not null default 'none',
  current_odometer_km numeric(12, 1),
  odometer_read_at timestamptz,
  current_engine_hours numeric(12, 1),
  engine_hours_read_at timestamptz,
  photo_path text,
  notes text check (notes is null or char_length(notes) <= 5000),
  duplicate_reason text check (duplicate_reason is null or char_length(duplicate_reason) <= 1000),
  -- System-managed (no client UPDATE privilege on these columns):
  condition public.asset_condition not null default 'active',
  condition_changed_at timestamptz not null default now(),
  became_current_at timestamptz not null default now(),
  archived_at timestamptz,
  archive_reason text,
  archive_effective_date date,
  archive_disposal public.asset_disposal,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (client_id, organisation_id) references public.clients (id, organisation_id),
  foreign key (site_id, organisation_id) references public.sites (id, organisation_id),
  foreign key (responsible_membership_id, organisation_id) references public.org_memberships (id, organisation_id),
  constraint assets_client_owned_needs_client check (owner_type <> 'client_owned' or client_id is not null),
  constraint assets_archive_complete check (
    (archived_at is null and archive_reason is null and archive_effective_date is null and archive_disposal is null)
    or (archived_at is not null and archive_reason is not null and archive_effective_date is not null and archive_disposal is not null)
  )
);
-- SoW §3.1: a duplicate asset number is refused (case-insensitive, per organisation).
create unique index assets_org_number_uidx on public.assets (organisation_id, lower(asset_number));
create index assets_org_current_idx on public.assets (organisation_id, archived_at, condition);
create index assets_org_class_idx on public.assets (organisation_id, asset_class_id);
create index assets_site_idx on public.assets (site_id);
create index assets_client_idx on public.assets (client_id);
create index assets_vin_idx on public.assets (organisation_id, upper(vin)) where vin is not null;
create index assets_serial_idx on public.assets (organisation_id, upper(serial_number)) where serial_number is not null;
create index assets_rego_idx on public.assets (organisation_id, upper(registration_number)) where registration_number is not null;
create index assets_search_trgm_idx on public.assets using gin (
  (lower(asset_number || ' ' || coalesce(make, '') || ' ' || coalesce(model, '') || ' ' || coalesce(registration_number, '') || ' ' || coalesce(vin, '') || ' ' || coalesce(serial_number, ''))) extensions.gin_trgm_ops
);
create trigger assets_updated_at before update on public.assets for each row execute function app.set_updated_at();

-- Validation shared by the asset trigger and the CSV import (one rule set).
-- Returns a JSON array of {field, code, message}.
create or replace function app.asset_validation_errors(
  p_organisation_id uuid, p_asset_id uuid, p_fields jsonb
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  errs jsonb := '[]'::jsonb;
  cls public.asset_classes%rowtype;
  f text;
  v text;
  dup_reason text := nullif(btrim(coalesce(p_fields ->> 'duplicate_reason', '')), '');
  dup_fields text[] := '{}';
begin
  select * into cls from public.asset_classes where id = (p_fields ->> 'asset_class_id')::uuid and active;
  if cls.id is null then
    return jsonb_build_array(jsonb_build_object('field', 'asset_class_id', 'code', 'invalid_class', 'message', 'Choose a valid asset class'));
  end if;

  foreach f in array cls.required_fields loop
    v := nullif(btrim(coalesce(p_fields ->> f, '')), '');
    if v is null then
      errs := errs || jsonb_build_object('field', f, 'code', 'required',
        'message', format('%s is required for %s', initcap(replace(f, '_', ' ')), cls.name));
    end if;
  end loop;

  if exists (
    select 1 from public.assets a
    where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and lower(a.asset_number) = lower(btrim(p_fields ->> 'asset_number'))
  ) then
    errs := errs || jsonb_build_object('field', 'asset_number', 'code', 'duplicate_asset_number',
      'message', 'Another asset already uses this asset number');
  end if;

  -- Duplicate VIN, serial or registration among current assets needs a reason.
  if nullif(btrim(coalesce(p_fields ->> 'vin', '')), '') is not null and exists (
    select 1 from public.assets a where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and a.archived_at is null and upper(a.vin) = upper(btrim(p_fields ->> 'vin'))) then
    dup_fields := array_append(dup_fields, 'vin');
  end if;
  if nullif(btrim(coalesce(p_fields ->> 'serial_number', '')), '') is not null and exists (
    select 1 from public.assets a where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and a.archived_at is null and upper(a.serial_number) = upper(btrim(p_fields ->> 'serial_number'))) then
    dup_fields := array_append(dup_fields, 'serial_number');
  end if;
  if nullif(btrim(coalesce(p_fields ->> 'registration_number', '')), '') is not null and exists (
    select 1 from public.assets a where a.organisation_id = p_organisation_id and a.id is distinct from p_asset_id
      and a.archived_at is null and upper(a.registration_number) = upper(btrim(p_fields ->> 'registration_number'))
      and a.registration_state is not distinct from (p_fields ->> 'registration_state')) then
    dup_fields := array_append(dup_fields, 'registration_number');
  end if;
  if cardinality(dup_fields) > 0 and dup_reason is null then
    foreach f in array dup_fields loop
      errs := errs || jsonb_build_object('field', f, 'code', 'duplicate_needs_reason',
        'message', format('Another current asset has the same %s. Give a reason to save a duplicate.', replace(f, '_', ' ')));
    end loop;
  end if;

  if (p_fields ->> 'owner_type') = 'client_owned' and nullif(p_fields ->> 'client_id', '') is null then
    errs := errs || jsonb_build_object('field', 'client_id', 'code', 'required', 'message', 'Client-owned assets need a client');
  end if;

  return errs;
end $$;

create or replace function app.assets_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  errs jsonb;
  org public.organisations%rowtype;
  current_count integer;
  free_assets integer := app.setting_int('pricing.fleet_free_assets');
begin
  if tg_op = 'INSERT' then
    -- Serialise asset creation per organisation (consent guard, counts).
    select * into org from public.organisations where id = new.organisation_id for update;
    if org.kind <> 'company' then
      perform app.raise('assets_company_only', 'Only company organisations keep an equipment register');
    end if;
    if org.status = 'restricted' then
      perform app.raise('account_restricted', 'Assets cannot be added while the account is restricted for non-payment');
    end if;

    select count(*) into current_count from public.assets where organisation_id = new.organisation_id and archived_at is null;
    -- SoW §5.2 consent: before a sixth current asset is saved, the Owner or a
    -- Finance member must have agreed to the price and added a payment method.
    if current_count >= free_assets and not exists (
      select 1 from public.fleet_subscription_consents c
      where c.organisation_id = new.organisation_id and c.withdrawn_at is null
    ) then
      perform app.raise('fleet_consent_required',
        format('Adding more than %s assets needs the Owner or a Finance member to agree to the fleet subscription and add a payment method', free_assets),
        jsonb_build_object('current_assets', current_count, 'free_assets', free_assets));
    end if;
    if current_count = free_assets and org.first_exceeded_free_allowance_at is null then
      update public.organisations set first_exceeded_free_allowance_at = now() where id = org.id;
    end if;

    -- System-managed fields are always set by the database.
    new.condition := 'active';
    new.condition_changed_at := now();
    new.became_current_at := now();
    new.archived_at := null; new.archive_reason := null; new.archive_effective_date := null; new.archive_disposal := null;
    new.current_odometer_km := null; new.odometer_read_at := null;
    new.current_engine_hours := null; new.engine_hours_read_at := null;
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    if new.organisation_id <> old.organisation_id then
      perform app.raise('immutable_field', 'Assets cannot move between organisations');
    end if;
  end if;

  new.asset_number := btrim(new.asset_number);
  new.vin := nullif(upper(btrim(coalesce(new.vin, ''))), '');
  new.serial_number := nullif(btrim(coalesce(new.serial_number, '')), '');
  new.registration_number := nullif(upper(btrim(coalesce(new.registration_number, ''))), '');

  if tg_op = 'INSERT' or row(new.asset_number, new.asset_class_id, new.make, new.model, new.registration_number,
       new.registration_state, new.vin, new.serial_number, new.owner_type, new.client_id, new.duplicate_reason)
     is distinct from row(old.asset_number, old.asset_class_id, old.make, old.model, old.registration_number,
       old.registration_state, old.vin, old.serial_number, old.owner_type, old.client_id, old.duplicate_reason) then
    errs := app.asset_validation_errors(new.organisation_id, new.id, to_jsonb(new));
    if jsonb_array_length(errs) > 0 then
      perform app.raise('asset_invalid', (errs -> 0 ->> 'message'), jsonb_build_object('errors', errs));
    end if;
  end if;
  return new;
end $$;

-- Defence in depth for direct Data API writes: refuse rows for organisations
-- the caller cannot manage BEFORE any lookup, so a refused insert reveals
-- nothing about another tenant (RLS WITH CHECK also refuses it, but only after
-- BEFORE triggers run). SECURITY INVOKER on purpose: current_user is
-- 'authenticated' for API writes and the function owner for writes made inside
-- trusted SECURITY DEFINER workflows (condition engine, meter refresh, import).
create or replace function app.assets_api_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not app.has_capability(new.organisation_id, 'assets.manage') then
    raise exception 'new row violates row-level security policy for table "assets"' using errcode = '42501';
  end if;
  return new;
end $$;

-- Triggers fire in name order: the guard runs first.
create trigger assets_a_api_guard before insert or update on public.assets
  for each row execute function app.assets_api_guard();
create trigger assets_before_write before insert or update on public.assets
  for each row execute function app.assets_before_write();

-- ---------------------------------------------------------------------------
-- Asset-count history (immutable). Drives "highest current assets in the QLD
-- month" for billing in arrears (SoW §5.2) and waiver qualification (§5.5).
-- ---------------------------------------------------------------------------
create table public.asset_count_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  delta smallint not null check (delta in (-1, 1)),
  reason text not null check (reason in ('created', 'imported', 'archived', 'restored', 'converted')),
  occurred_at timestamptz not null default now()
);
create index asset_count_events_org_time_idx on public.asset_count_events (organisation_id, occurred_at);
create trigger asset_count_events_immutable before update or delete on public.asset_count_events
  for each row execute function app.prevent_audit_mutation();

create or replace function app.assets_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.asset_count_events (organisation_id, asset_id, delta, reason)
  values (new.organisation_id, new.id, 1, coalesce(nullif(current_setting('app.asset_create_reason', true), ''), 'created'));
  return new;
end $$;
create trigger assets_after_insert after insert on public.assets
  for each row execute function app.assets_after_insert();

-- ---------------------------------------------------------------------------
-- Fleet subscription consent (SoW §5.2). Recorded with time and price shown.
-- ---------------------------------------------------------------------------
create table public.fleet_subscription_consents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  consented_by uuid not null references auth.users (id),
  consented_at timestamptz not null default now(),
  price_per_asset_cents integer not null,
  free_assets integer not null,
  payment_method_id uuid references public.payment_methods (id),
  withdrawn_at timestamptz
);
create index fleet_consents_org_idx on public.fleet_subscription_consents (organisation_id) where withdrawn_at is null;

-- ---------------------------------------------------------------------------
-- Permitted operators (SoW §3.1 "permitted drivers", §3.2 "permitted assets
-- or sites"). Driver profiles without logins are added in increment 2B.
-- ---------------------------------------------------------------------------
create table public.asset_operator_permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  membership_id uuid not null,
  asset_id uuid,
  site_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (membership_id, organisation_id) references public.org_memberships (id, organisation_id) on delete cascade,
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade,
  foreign key (site_id, organisation_id) references public.sites (id, organisation_id) on delete cascade,
  constraint operator_permission_target check ((asset_id is null) <> (site_id is null))
);
create unique index operator_perm_asset_uidx on public.asset_operator_permissions (membership_id, asset_id) where asset_id is not null;
create unique index operator_perm_site_uidx on public.asset_operator_permissions (membership_id, site_id) where site_id is not null;

create or replace function app.permitted_asset_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.id), '{}')
  from public.org_memberships m
  join public.asset_operator_permissions p on p.membership_id = m.id
  join public.assets a on a.organisation_id = m.organisation_id
    and (a.id = p.asset_id or (p.site_id is not null and a.site_id = p.site_id))
  where m.user_id = auth.uid() and m.status = 'active'
$$;

-- ---------------------------------------------------------------------------
-- Asset condition engine (SoW §3.4; Confirmed decision #5)
-- Condition is derived ONLY from open causes. No role can write it.
-- ---------------------------------------------------------------------------
create table public.asset_condition_causes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  asset_id uuid not null,
  kind public.condition_cause_kind not null,
  source_type text not null,          -- e.g. 'defect', 'hold', 'service_occurrence'
  source_id uuid,
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text,
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create index condition_causes_open_idx on public.asset_condition_causes (asset_id) where resolved_at is null;
create unique index condition_causes_one_open_per_source on public.asset_condition_causes (asset_id, kind, source_type, source_id)
  where resolved_at is null and source_id is not null;

create table public.asset_condition_history (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  asset_id uuid not null,
  from_condition public.asset_condition not null,
  to_condition public.asset_condition not null,
  cause_id uuid references public.asset_condition_causes (id),
  cause_kind public.condition_cause_kind,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create index condition_history_asset_idx on public.asset_condition_history (asset_id, changed_at desc);
create trigger condition_history_immutable before update or delete on public.asset_condition_history
  for each row execute function app.prevent_audit_mutation();

create or replace function app.derive_condition(p_asset_id uuid) returns public.asset_condition
language sql stable security definer set search_path = '' as $$
  select case
    when exists (
      select 1 from public.asset_condition_causes c
      where c.asset_id = p_asset_id and c.resolved_at is null
        and c.kind in ('critical_defect', 'unverified_unsafe_report', 'critical_finding_awaiting_review',
                       'out_of_service_hold', 'awaiting_return_to_service')
    ) then 'out_of_service'::public.asset_condition
    when exists (
      select 1 from public.asset_condition_causes c
      join public.assets a on a.id = c.asset_id
      join public.organisations o on o.id = a.organisation_id
      where c.asset_id = p_asset_id and c.resolved_at is null
        and (c.kind in ('minor_defect', 'needs_attention_hold')
             or (c.kind = 'overdue_service' and coalesce((o.settings ->> 'overdue_service_sets_needs_attention')::boolean, false)))
    ) then 'needs_attention'::public.asset_condition
    else 'active'::public.asset_condition
  end
$$;

create or replace function app.recompute_asset_condition(p_asset_id uuid, p_cause_id uuid default null)
returns public.asset_condition
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  derived public.asset_condition;
  ck public.condition_cause_kind;
begin
  select * into a from public.assets where id = p_asset_id for update;
  derived := app.derive_condition(p_asset_id);
  if derived is distinct from a.condition then
    select kind into ck from public.asset_condition_causes where id = p_cause_id;
    update public.assets set condition = derived, condition_changed_at = now() where id = p_asset_id;
    insert into public.asset_condition_history (organisation_id, asset_id, from_condition, to_condition, cause_id, cause_kind, changed_by)
    values (a.organisation_id, a.id, a.condition, derived, p_cause_id, ck, auth.uid());
  end if;
  return derived;
end $$;

create or replace function app.condition_causes_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.recompute_asset_condition(new.asset_id, new.id);
  return new;
end $$;
create trigger condition_causes_recompute after insert or update on public.asset_condition_causes
  for each row execute function app.condition_causes_after_change();

-- Opening and resolving causes is reserved for safety workflows (increment 2B:
-- defects, holds, clearance). Resolving a Critical defect cause automatically
-- opens an "awaiting return-to-service" cause: clearing the defect and
-- returning the asset to service are separate steps (SoW §3.4, decision #6).
create or replace function app.open_condition_cause(
  p_asset_id uuid, p_kind public.condition_cause_kind, p_source_type text, p_source_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select organisation_id into v_org from public.assets where id = p_asset_id;
  insert into public.asset_condition_causes (organisation_id, asset_id, kind, source_type, source_id, opened_by)
  values (v_org, p_asset_id, p_kind, p_source_type, p_source_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.resolve_condition_cause(p_cause_id uuid, p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.asset_condition_causes%rowtype;
begin
  select * into c from public.asset_condition_causes where id = p_cause_id and resolved_at is null for update;
  if c.id is null then
    perform app.raise('not_found', 'Open condition cause not found');
  end if;
  if c.kind in ('critical_defect', 'critical_finding_awaiting_review', 'unverified_unsafe_report', 'out_of_service_hold')
     and p_resolution = 'cleared' then
    -- Open the follow-on cause BEFORE resolving, so the asset never passes through Active.
    insert into public.asset_condition_causes (organisation_id, asset_id, kind, source_type, source_id, opened_by)
    values (c.organisation_id, c.asset_id, 'awaiting_return_to_service', 'clearance', c.id, auth.uid())
    on conflict do nothing;
  end if;
  update public.asset_condition_causes
  set resolved_at = now(), resolved_by = auth.uid(), resolution = p_resolution
  where id = p_cause_id;
end $$;

-- Return-to-service is possible only when no Broken/Out of service cause other
-- than "awaiting return to service" remains open.
create or replace function app.can_return_to_service(p_asset_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.asset_condition_causes c
    where c.asset_id = p_asset_id and c.resolved_at is null
      and c.kind in ('critical_defect', 'unverified_unsafe_report', 'critical_finding_awaiting_review', 'out_of_service_hold')
  )
$$;

-- ---------------------------------------------------------------------------
-- Meter readings (SoW §3.1): never overwrite each other; lower readings need a
-- reason and a manager's acceptance; implausible jumps need confirmation;
-- corrections are amendments. Idempotent on client_request_id (offline sync).
-- ---------------------------------------------------------------------------
create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  asset_id uuid not null,
  unit public.meter_unit not null,
  value numeric(12, 1) not null check (value >= 0),
  read_at timestamptz not null default now(),
  source public.meter_reading_source not null default 'manual',
  source_id uuid,
  status public.meter_reading_status not null,
  recorded_by uuid references auth.users (id) on delete set null,
  identification_method public.identification_method not null,
  lower_reading_reason text,
  jump_confirmed boolean not null default false,
  out_of_sequence boolean not null default false,
  amends_reading_id uuid references public.meter_readings (id),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create index meter_readings_asset_idx on public.meter_readings (asset_id, unit, read_at desc);
create index meter_readings_pending_idx on public.meter_readings (organisation_id) where status = 'pending_acceptance';
create unique index meter_readings_idempotency_uidx on public.meter_readings (organisation_id, client_request_id)
  where client_request_id is not null;

create or replace function app.refresh_asset_meter(p_asset_id uuid, p_unit public.meter_unit) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  select value, read_at into r from public.meter_readings
  where asset_id = p_asset_id and unit = p_unit and status = 'accepted'
  order by read_at desc, created_at desc limit 1;
  if p_unit = 'km' then
    update public.assets set current_odometer_km = r.value, odometer_read_at = r.read_at where id = p_asset_id;
  else
    update public.assets set current_engine_hours = r.value, engine_hours_read_at = r.read_at where id = p_asset_id;
  end if;
end $$;

create or replace function public.record_meter_reading(
  p_asset_id uuid, p_unit public.meter_unit, p_value numeric,
  p_read_at timestamptz default null, p_source public.meter_reading_source default 'manual',
  p_client_request_id uuid default null, p_lower_reason text default null, p_confirm_jump boolean default false
) returns public.meter_readings
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  prev public.meter_readings%rowtype;
  existing public.meter_readings%rowtype;
  v_read_at timestamptz := coalesce(p_read_at, now());
  v_status public.meter_reading_status := 'accepted';
  v_out_of_seq boolean := false;
  v_days numeric;
  v_max numeric;
  rec public.meter_readings%rowtype;
begin
  select * into a from public.assets where id = p_asset_id;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'meter_readings.record');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not permitted to operate this asset');
  end if;
  if a.archived_at is not null then
    perform app.raise('asset_archived', 'Readings cannot be added to an archived asset');
  end if;
  if not ((p_unit = 'km' and a.meter_type in ('kilometres', 'both')) or (p_unit = 'hours' and a.meter_type in ('hours', 'both'))) then
    perform app.raise('meter_type_mismatch', 'This asset does not record that meter type');
  end if;
  if v_read_at > now() + interval '5 minutes' then
    perform app.raise('read_at_in_future', 'A reading cannot be dated in the future');
  end if;

  -- Idempotent retries return the original record (SoW §7.2 "records sync once").
  if p_client_request_id is not null then
    select * into existing from public.meter_readings
    where organisation_id = a.organisation_id and client_request_id = p_client_request_id;
    if existing.id is not null then
      return existing;
    end if;
  end if;

  select * into prev from public.meter_readings
  where asset_id = a.id and unit = p_unit and status = 'accepted'
  order by read_at desc, created_at desc limit 1;

  if prev.id is not null then
    if v_read_at < prev.read_at then
      -- Arrived out of order (e.g. offline capture): kept and flagged for review.
      v_out_of_seq := true;
      v_status := 'pending_acceptance';
    elsif p_value < prev.value then
      if char_length(btrim(coalesce(p_lower_reason, ''))) < 3 then
        perform app.raise('lower_reading_reason_required',
          format('This reading is lower than the last accepted reading (%s). Give a reason; a manager must accept it.', prev.value),
          jsonb_build_object('previous_value', prev.value));
      end if;
      v_status := 'pending_acceptance';
    else
      v_days := greatest(extract(epoch from (v_read_at - prev.read_at)) / 86400.0, 1);
      v_max := case p_unit when 'km' then app.setting_int('meter.max_km_per_day') else app.setting_int('meter.max_hours_per_day') end;
      if (p_value - prev.value) / v_days > v_max and not coalesce(p_confirm_jump, false) then
        perform app.raise('implausible_jump_confirmation_required',
          format('That is a jump of %s since the last reading. Confirm it is correct.', p_value - prev.value),
          jsonb_build_object('previous_value', prev.value, 'difference', p_value - prev.value));
      end if;
    end if;
  end if;

  insert into public.meter_readings (organisation_id, asset_id, unit, value, read_at, source, status, recorded_by,
    identification_method, lower_reading_reason, jump_confirmed, out_of_sequence, client_request_id)
  values (a.organisation_id, a.id, p_unit, p_value, v_read_at, p_source, v_status, auth.uid(),
    app.current_identification_method(), nullif(btrim(coalesce(p_lower_reason, '')), ''),
    coalesce(p_confirm_jump, false), v_out_of_seq, p_client_request_id)
  returning * into rec;

  if v_status = 'accepted' then
    perform app.refresh_asset_meter(a.id, p_unit);
  end if;
  return rec;
end $$;

create or replace function public.decide_meter_reading(p_reading_id uuid, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.meter_readings%rowtype;
begin
  select * into r from public.meter_readings where id = p_reading_id for update;
  if r.id is null then
    perform app.raise('not_found', 'Reading not found');
  end if;
  perform app.require_capability(r.organisation_id, 'meter_readings.accept');
  if r.status <> 'pending_acceptance' then
    perform app.raise('not_pending', 'This reading is not awaiting a decision');
  end if;
  update public.meter_readings
  set status = case when p_accept then 'accepted' else 'rejected' end::public.meter_reading_status,
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_reading_id;
  perform app.refresh_asset_meter(r.asset_id, r.unit);
end $$;

-- Correction by amendment: the original stays (superseded) and a new accepted
-- reading references it.
create or replace function public.amend_meter_reading(p_reading_id uuid, p_value numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.meter_readings%rowtype;
  v_id uuid;
begin
  select * into r from public.meter_readings where id = p_reading_id for update;
  if r.id is null then
    perform app.raise('not_found', 'Reading not found');
  end if;
  perform app.require_capability(r.organisation_id, 'meter_readings.accept');
  if r.status = 'superseded' then
    perform app.raise('already_amended', 'This reading has already been amended');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'A reason is required');
  end if;
  update public.meter_readings set status = 'superseded', decided_by = auth.uid(), decided_at = now(), decision_note = p_reason
  where id = p_reading_id;
  insert into public.meter_readings (organisation_id, asset_id, unit, value, read_at, source, status, recorded_by,
    identification_method, amends_reading_id, decided_by, decided_at, decision_note)
  values (r.organisation_id, r.asset_id, r.unit, p_value, r.read_at, r.source, 'accepted', auth.uid(),
    app.current_identification_method(), r.id, auth.uid(), now(), p_reason)
  returning id into v_id;
  perform app.refresh_asset_meter(r.asset_id, r.unit);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Consent, archiving and import RPCs
-- ---------------------------------------------------------------------------
create or replace function public.record_fleet_subscription_consent(
  p_organisation_id uuid, p_price_per_asset_cents integer, p_free_assets integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pm uuid;
  v_id uuid;
begin
  perform app.require_capability(p_organisation_id, 'org.billing.manage');
  perform app.require_mfa_if_needed(p_organisation_id);
  if p_price_per_asset_cents <> app.setting_int('pricing.fleet_per_asset_cents')
     or p_free_assets <> app.setting_int('pricing.fleet_free_assets') then
    perform app.raise('price_changed', 'The price has changed. Review the current price and try again.');
  end if;
  select id into v_pm from public.payment_methods
  where organisation_id = p_organisation_id and detached_at is null
  order by is_default desc, created_at desc limit 1;
  if v_pm is null then
    perform app.raise('payment_method_required', 'Add a payment method before agreeing to the fleet subscription');
  end if;
  insert into public.fleet_subscription_consents (organisation_id, consented_by, price_per_asset_cents, free_assets, payment_method_id)
  values (p_organisation_id, auth.uid(), p_price_per_asset_cents, p_free_assets, v_pm)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.archive_asset(
  p_asset_id uuid, p_reason text, p_effective_date date,
  p_disposal public.asset_disposal default 'retired', p_open_issues_acknowledged boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
begin
  select * into a from public.assets where id = p_asset_id for update;
  if a.id is null then
    perform app.raise('not_found', 'Asset not found');
  end if;
  perform app.require_capability(a.organisation_id, 'assets.manage');
  if a.archived_at is not null then
    perform app.raise('already_archived', 'This asset is already archived');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Archiving needs a reason');
  end if;
  if p_effective_date is null then
    perform app.raise('effective_date_required', 'Archiving needs an effective date');
  end if;
  -- SoW §3.1: open defects must be acknowledged before an asset is archived for sale.
  if p_disposal = 'sold' and not coalesce(p_open_issues_acknowledged, false) and exists (
    select 1 from public.asset_condition_causes where asset_id = a.id and resolved_at is null
  ) then
    perform app.raise('open_issues_must_be_acknowledged', 'Acknowledge the open defects and holds before archiving this asset for sale');
  end if;

  update public.assets
  set archived_at = now(), archive_reason = btrim(p_reason), archive_effective_date = p_effective_date, archive_disposal = p_disposal
  where id = a.id;
  insert into public.asset_count_events (organisation_id, asset_id, delta, reason) values (a.organisation_id, a.id, -1, 'archived');
  perform app.audit('archive', 'assets', a.id, a.organisation_id,
    jsonb_build_object('reason', p_reason, 'effective_date', p_effective_date, 'disposal', p_disposal,
                       'open_issues_acknowledged', p_open_issues_acknowledged));
end $$;

-- CSV import (SoW §3.1): up to 1,000 rows; a trial run reports every row's
-- errors before anything is saved; the real run is all-or-nothing.
-- p_rows: JSON array of objects keyed by the template's column names.
create or replace function public.import_assets(p_organisation_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_max integer := app.setting_int('import.max_rows');
  v_free integer := app.setting_int('pricing.fleet_free_assets');
  v_count integer;
  v_current integer;
  errors jsonb := '[]'::jsonb;
  row_errs jsonb;
  r jsonb;
  i integer := 0;
  v_class uuid;
  v_client uuid;
  v_site uuid;
  v_meter public.meter_type;
  fields jsonb;
  seen_numbers text[] := '{}';
  prepared jsonb := '[]'::jsonb;
  v_asset uuid;
  e jsonb;
begin
  perform app.require_capability(p_organisation_id, 'assets.manage');
  if jsonb_typeof(p_rows) <> 'array' then
    perform app.raise('invalid_import', 'Rows must be a list');
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count = 0 then
    perform app.raise('empty_import', 'The file has no rows');
  end if;
  if v_count > v_max then
    perform app.raise('too_many_rows', format('A file can have up to %s rows', v_max));
  end if;

  perform 1 from public.organisations where id = p_organisation_id for update;
  v_current := app.current_asset_count(p_organisation_id);

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    row_errs := '[]'::jsonb;

    select id, default_meter_type into v_class, v_meter
    from public.asset_classes where code = lower(btrim(coalesce(r ->> 'asset_class', ''))) and active;
    if v_class is null then
      row_errs := row_errs || jsonb_build_object('field', 'asset_class', 'code', 'invalid_class',
        'message', 'Unknown asset class. Use one of the class codes in the template.');
    end if;

    v_client := null;
    if nullif(btrim(coalesce(r ->> 'client', '')), '') is not null then
      select id into v_client from public.clients
      where organisation_id = p_organisation_id and archived_at is null and lower(name) = lower(btrim(r ->> 'client'));
      if v_client is null then
        row_errs := row_errs || jsonb_build_object('field', 'client', 'code', 'unknown_client', 'message', 'No client with that name');
      end if;
    end if;
    v_site := null;
    if nullif(btrim(coalesce(r ->> 'site', '')), '') is not null then
      select id into v_site from public.sites
      where organisation_id = p_organisation_id and archived_at is null and lower(name) = lower(btrim(r ->> 'site'));
      if v_site is null then
        row_errs := row_errs || jsonb_build_object('field', 'site', 'code', 'unknown_site', 'message', 'No site with that name');
      end if;
    end if;

    if nullif(btrim(coalesce(r ->> 'registration_state', '')), '') is not null
       and not app.is_au_state(upper(btrim(r ->> 'registration_state'))) then
      row_errs := row_errs || jsonb_build_object('field', 'registration_state', 'code', 'invalid_state', 'message', 'Use QLD, NSW, VIC, SA, WA, TAS, NT or ACT');
    end if;
    if nullif(btrim(coalesce(r ->> 'year', '')), '') is not null and (r ->> 'year') !~ '^\d{4}$' then
      row_errs := row_errs || jsonb_build_object('field', 'year', 'code', 'invalid_year', 'message', 'Year must be four digits');
    end if;
    if coalesce(nullif(lower(btrim(r ->> 'owner_type')), ''), 'own') not in ('own', 'client_owned', 'hired_in') then
      row_errs := row_errs || jsonb_build_object('field', 'owner_type', 'code', 'invalid_owner_type', 'message', 'Use own, client_owned or hired_in');
    end if;
    if nullif(btrim(coalesce(r ->> 'meter_type', '')), '') is not null
       and lower(btrim(r ->> 'meter_type')) not in ('none', 'kilometres', 'hours', 'both') then
      row_errs := row_errs || jsonb_build_object('field', 'meter_type', 'code', 'invalid_meter_type', 'message', 'Use none, kilometres, hours or both');
    end if;
    if nullif(btrim(coalesce(r ->> 'asset_number', '')), '') is null then
      row_errs := row_errs || jsonb_build_object('field', 'asset_number', 'code', 'required', 'message', 'Asset number is required');
    elsif lower(btrim(r ->> 'asset_number')) = any (seen_numbers) then
      row_errs := row_errs || jsonb_build_object('field', 'asset_number', 'code', 'duplicate_in_file', 'message', 'This asset number appears earlier in the file');
    else
      seen_numbers := seen_numbers || lower(btrim(r ->> 'asset_number'));
    end if;

    if v_class is not null and jsonb_array_length(row_errs) = 0 then
      fields := jsonb_build_object(
        'asset_number', btrim(r ->> 'asset_number'),
        'asset_class_id', v_class,
        'make', nullif(btrim(coalesce(r ->> 'make', '')), ''),
        'model', nullif(btrim(coalesce(r ->> 'model', '')), ''),
        'year', nullif(btrim(coalesce(r ->> 'year', '')), ''),
        'registration_number', nullif(upper(btrim(coalesce(r ->> 'registration_number', ''))), ''),
        'registration_state', nullif(upper(btrim(coalesce(r ->> 'registration_state', ''))), ''),
        'vin', nullif(upper(btrim(coalesce(r ->> 'vin', ''))), ''),
        'serial_number', nullif(btrim(coalesce(r ->> 'serial_number', '')), ''),
        'owner_type', coalesce(nullif(lower(btrim(r ->> 'owner_type')), ''), 'own'),
        'client_id', v_client,
        'site_id', v_site,
        'meter_type', coalesce(nullif(lower(btrim(r ->> 'meter_type')), ''), v_meter::text),
        'notes', nullif(btrim(coalesce(r ->> 'notes', '')), ''),
        'duplicate_reason', nullif(btrim(coalesce(r ->> 'duplicate_reason', '')), ''),
        'odometer_km', nullif(btrim(coalesce(r ->> 'odometer_km', '')), ''),
        'engine_hours', nullif(btrim(coalesce(r ->> 'engine_hours', '')), '')
      );
      row_errs := row_errs || app.asset_validation_errors(p_organisation_id, null, fields);
      prepared := prepared || fields;
    end if;

    for e in select value from jsonb_array_elements(row_errs) loop
      errors := errors || (e || jsonb_build_object('row', i));
    end loop;
  end loop;

  if v_current + v_count > v_free and not exists (
    select 1 from public.fleet_subscription_consents where organisation_id = p_organisation_id and withdrawn_at is null
  ) then
    errors := errors || jsonb_build_object('row', null, 'field', null, 'code', 'fleet_consent_required',
      'message', format('This import would take the company above %s assets. The Owner or a Finance member must first agree to the fleet subscription.', v_free));
  end if;

  if p_dry_run or jsonb_array_length(errors) > 0 then
    return jsonb_build_object('dry_run', p_dry_run, 'row_count', v_count, 'valid', jsonb_array_length(errors) = 0,
                              'created', 0, 'errors', errors);
  end if;

  perform set_config('app.asset_create_reason', 'imported', true);
  for fields in select value from jsonb_array_elements(prepared) loop
    insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, year, registration_number,
      registration_state, vin, serial_number, owner_type, client_id, site_id, meter_type, notes, duplicate_reason)
    values (p_organisation_id, fields ->> 'asset_number', (fields ->> 'asset_class_id')::uuid, fields ->> 'make', fields ->> 'model',
      (fields ->> 'year')::smallint, fields ->> 'registration_number', fields ->> 'registration_state', fields ->> 'vin',
      fields ->> 'serial_number', (fields ->> 'owner_type')::public.asset_owner_type, (fields ->> 'client_id')::uuid,
      (fields ->> 'site_id')::uuid, (fields ->> 'meter_type')::public.meter_type, fields ->> 'notes', fields ->> 'duplicate_reason')
    returning id into v_asset;
    if fields ->> 'odometer_km' is not null then
      perform public.record_meter_reading(v_asset, 'km', (fields ->> 'odometer_km')::numeric, now(), 'import');
    end if;
    if fields ->> 'engine_hours' is not null then
      perform public.record_meter_reading(v_asset, 'hours', (fields ->> 'engine_hours')::numeric, now(), 'import');
    end if;
  end loop;
  perform set_config('app.asset_create_reason', '', true);
  perform app.audit('import', 'assets', null, p_organisation_id, jsonb_build_object('rows', v_count));

  return jsonb_build_object('dry_run', false, 'row_count', v_count, 'valid', true, 'created', v_count, 'errors', '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- RLS & privileges
-- ---------------------------------------------------------------------------
alter table public.asset_classes enable row level security;
alter table public.clients enable row level security;
alter table public.sites enable row level security;
alter table public.assets enable row level security;
alter table public.asset_count_events enable row level security;
alter table public.fleet_subscription_consents enable row level security;
alter table public.asset_operator_permissions enable row level security;
alter table public.asset_condition_causes enable row level security;
alter table public.asset_condition_history enable row level security;
alter table public.meter_readings enable row level security;

revoke all on public.asset_classes, public.clients, public.sites, public.assets, public.asset_count_events,
  public.fleet_subscription_consents, public.asset_operator_permissions, public.asset_condition_causes,
  public.asset_condition_history, public.meter_readings
  from anon, authenticated;

grant select on public.asset_classes, public.clients, public.sites, public.assets, public.asset_count_events,
  public.fleet_subscription_consents, public.asset_operator_permissions, public.asset_condition_causes,
  public.asset_condition_history, public.meter_readings
  to authenticated;

-- Column-level write privileges: system-managed columns (condition, archive
-- fields, current meter values, organisation) are never client-writable.
grant insert (id, organisation_id, name, abn, contact_name, contact_email, contact_phone, address, notes)
  on public.clients to authenticated;
grant update (name, abn, contact_name, contact_email, contact_phone, address, notes, archived_at)
  on public.clients to authenticated;
grant insert (id, organisation_id, client_id, name, address_line1, address_line2, suburb, state, postcode, timezone,
  contact_name, contact_phone, contact_email, shift_times, access_instructions, safety_instructions)
  on public.sites to authenticated;
grant update (client_id, name, address_line1, address_line2, suburb, state, postcode, timezone, contact_name,
  contact_phone, contact_email, shift_times, access_instructions, safety_instructions, archived_at)
  on public.sites to authenticated;
grant insert (id, organisation_id, asset_number, asset_class_id, make, model, year, registration_number,
  registration_state, vin, serial_number, owner_type, client_id, site_id, responsible_membership_id, meter_type,
  photo_path, notes, duplicate_reason)
  on public.assets to authenticated;
grant update (asset_number, asset_class_id, make, model, year, registration_number, registration_state, vin,
  serial_number, owner_type, client_id, site_id, responsible_membership_id, meter_type, photo_path, notes, duplicate_reason)
  on public.assets to authenticated;
grant insert (id, organisation_id, membership_id, asset_id, site_id) on public.asset_operator_permissions to authenticated;
grant delete on public.asset_operator_permissions to authenticated;

create policy asset_classes_read on public.asset_classes for select to authenticated using (true);

create policy clients_read on public.clients for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('clients.view'))::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
);
create policy clients_insert on public.clients for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('clients.manage'))::uuid[]));
create policy clients_update on public.clients for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('clients.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('clients.manage'))::uuid[]));

create policy sites_read on public.sites for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('sites.view'))::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
);
create policy sites_insert on public.sites for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('sites.manage'))::uuid[]));
create policy sites_update on public.sites for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('sites.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('sites.manage'))::uuid[]));

create policy assets_read on public.assets for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or (organisation_id = any ((select app.orgs_with_capability('assets.view_permitted'))::uuid[])
      and id = any ((select app.permitted_asset_ids())::uuid[]))
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
);
create policy assets_insert on public.assets for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('assets.manage'))::uuid[]));
create policy assets_update on public.assets for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('assets.manage'))::uuid[]) and archived_at is null)
  with check (organisation_id = any ((select app.orgs_with_capability('assets.manage'))::uuid[]));

create policy asset_count_events_read on public.asset_count_events for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])
  or (select app.is_platform_staff())
);
create policy fleet_consents_read on public.fleet_subscription_consents for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])
  or (select app.is_platform_staff())
);

create policy operator_perms_read on public.asset_operator_permissions for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or membership_id in (select id from public.org_memberships where user_id = (select auth.uid()))
);
create policy operator_perms_insert on public.asset_operator_permissions for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]));
create policy operator_perms_delete on public.asset_operator_permissions for delete to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]));

create policy condition_causes_read on public.asset_condition_causes for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or asset_id = any ((select app.permitted_asset_ids())::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
);
create policy condition_history_read on public.asset_condition_history for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or asset_id = any ((select app.permitted_asset_ids())::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
);
create policy meter_readings_read on public.meter_readings for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or asset_id = any ((select app.permitted_asset_ids())::uuid[])
  or organisation_id = any ((select app.orgs_with_support_access())::uuid[])
);

-- Audit triggers
create trigger audit_clients after insert or update or delete on public.clients
  for each row execute function app.audit_row_change();
create trigger audit_sites after insert or update or delete on public.sites
  for each row execute function app.audit_row_change();
create trigger audit_assets after insert or update or delete on public.assets
  for each row execute function app.audit_row_change();
create trigger audit_operator_permissions after insert or update or delete on public.asset_operator_permissions
  for each row execute function app.audit_row_change();
create trigger audit_condition_causes after insert or update on public.asset_condition_causes
  for each row execute function app.audit_row_change();
create trigger audit_meter_readings after insert or update on public.meter_readings
  for each row execute function app.audit_row_change();
create trigger audit_fleet_consents after insert or update on public.fleet_subscription_consents
  for each row execute function app.audit_row_change();

-- Function privileges
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.record_meter_reading(uuid, public.meter_unit, numeric, timestamptz, public.meter_reading_source, uuid, text, boolean),
  public.decide_meter_reading(uuid, boolean, text),
  public.amend_meter_reading(uuid, numeric, text),
  public.record_fleet_subscription_consent(uuid, integer, integer),
  public.archive_asset(uuid, text, date, public.asset_disposal, boolean),
  public.import_assets(uuid, jsonb, boolean)
to authenticated;

-- Helper functions used inside RLS policies must be executable by the API
-- role; the `app` schema itself is never exposed through the Data API.
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- Internal condition-engine entry points are NOT callable by API roles; only
-- SECURITY DEFINER safety workflows (increment 2B) may open/resolve causes.
revoke execute on function app.open_condition_cause(uuid, public.condition_cause_kind, text, uuid) from authenticated;
revoke execute on function app.resolve_condition_cause(uuid, text) from authenticated;
revoke execute on function app.recompute_asset_condition(uuid, uuid) from authenticated;
revoke execute on function app.refresh_asset_meter(uuid, public.meter_unit) from authenticated;
