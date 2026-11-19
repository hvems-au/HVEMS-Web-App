-- =============================================================================
-- 2D Marketplace, part 1: regions, provider profiles and verification
-- (SoW 4.3, 4.9; spec MKT-01, MKT-02, MKT-03, MKT-25; decision O-01).
-- * Marketplace regions: HVEMS opens regions for posting from the console
--   (default: Moreton Bay and surrounding South East Queensland). Posters outside
--   can register interest.
-- * Provider profile: categories, asset classes, service area (listed regions,
--   or a base suburb and radius), mobile service, workshop, hours, availability,
--   urgent switch. Private contacts stay private until an engagement.
-- * Verification: the provider submits; a Verification Officer checks the ABN by
--   hand (O-01: no ABN Lookup), the public liability certificate and any required
--   qualifications, then approves or rejects with a reason. Badges record exactly
--   what was checked, by whom and when; uploading a document never creates one.
-- * Eligibility to propose (MKT-03) is one database function; this part checks
--   verified, not suspended and insurance current. Subscription and saved payment
--   method are added with billing (2D, Stripe).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Regions (MKT-25)
-- ---------------------------------------------------------------------------
create table public.marketplace_regions (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  state text not null default 'QLD' check (app.is_au_state(state)),
  open boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create trigger audit_marketplace_regions after insert or update or delete on public.marketplace_regions
  for each row execute function app.audit_row_change();
alter table public.marketplace_regions enable row level security;
revoke all on public.marketplace_regions from anon, authenticated;
grant select on public.marketplace_regions to authenticated;
create policy marketplace_regions_read on public.marketplace_regions for select to authenticated using (true);

-- South East Queensland council areas; Moreton Bay and its neighbours open at launch (SoW 9.3).
insert into public.marketplace_regions (code, name, open, sort_order) values
  ('moreton_bay', 'Moreton Bay', true, 1),
  ('brisbane', 'Brisbane', true, 2),
  ('sunshine_coast', 'Sunshine Coast', true, 3),
  ('somerset', 'Somerset', true, 4),
  ('ipswich', 'Ipswich', true, 5),
  ('logan', 'Logan', true, 6),
  ('redland', 'Redland', true, 7),
  ('noosa', 'Noosa', false, 8),
  ('gold_coast', 'Gold Coast', false, 9),
  ('lockyer_valley', 'Lockyer Valley', false, 10),
  ('scenic_rim', 'Scenic Rim', false, 11),
  ('toowoomba', 'Toowoomba', false, 12);

create or replace function public.set_marketplace_region(p_code text, p_name text, p_open boolean, p_sort integer default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Platform Administrator manages regions');
  end if;
  insert into public.marketplace_regions (code, name, open, sort_order)
  values (lower(btrim(p_code)), btrim(p_name), coalesce(p_open, false), coalesce(p_sort, 100))
  on conflict (code) do update set name = excluded.name, open = excluded.open,
    sort_order = coalesce(p_sort, public.marketplace_regions.sort_order), updated_at = now();
end $$;
revoke execute on function public.set_marketplace_region(text, text, boolean, integer) from public, anon;
grant execute on function public.set_marketplace_region(text, text, boolean, integer) to authenticated, service_role;

-- Interest from posters outside open regions.
create table public.region_interest (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  suburb text not null check (char_length(btrim(suburb)) between 2 and 80),
  postcode text check (postcode is null or postcode ~ '^\d{4}$'),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index region_interest_org_idx on public.region_interest (organisation_id);
create index region_interest_user_idx on public.region_interest (user_id);
alter table public.region_interest enable row level security;
revoke all on public.region_interest from anon, authenticated;
grant select on public.region_interest to authenticated;
create policy region_interest_read on public.region_interest for select to authenticated using (
  user_id = (select auth.uid()) or (select app.is_platform_staff()));

create or replace function public.register_region_interest(p_organisation_id uuid, p_suburb text, p_postcode text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_organisation_id is not null then
    perform app.require_capability(p_organisation_id, 'org.view');
  end if;
  insert into public.region_interest (organisation_id, suburb, postcode, note)
  values (p_organisation_id, btrim(p_suburb), nullif(btrim(coalesce(p_postcode, '')), ''), nullif(btrim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function public.register_region_interest(uuid, text, text, text) from public, anon;
grant execute on function public.register_region_interest(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provider profiles (MKT-01)
-- ---------------------------------------------------------------------------
create or replace function app.provider_categories_valid(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p <@ array['diesel_mechanical', 'auto_electrical', 'hydraulics', 'tyres', 'welding_fabrication',
                             'refrigeration', 'mobile_plant', 'inspections', 'towing_recovery', 'other']::text[], false)
$$;

create table public.provider_profiles (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  description text check (description is null or char_length(description) <= 2000),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  categories text[] not null default '{}' check (app.provider_categories_valid(categories)),
  asset_class_codes text[] not null default '{}',
  region_codes text[] not null default '{}',
  base_suburb text check (base_suburb is null or char_length(base_suburb) <= 80),
  base_postcode text check (base_postcode is null or base_postcode ~ '^\d{4}$'),
  radius_km integer check (radius_km is null or radius_km between 1 and 1000),
  mobile_service boolean not null default false,
  workshop_address text check (workshop_address is null or char_length(workshop_address) <= 300),
  hours text check (hours is null or char_length(hours) <= 500),
  accepting_urgent boolean not null default false,
  unavailable_dates date[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'verified', 'rejected', 'suspended')),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 2000),
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index provider_profiles_decided_by_idx on public.provider_profiles (decided_by);
create index provider_profiles_status_idx on public.provider_profiles (status);
create trigger audit_provider_profiles after insert or update or delete on public.provider_profiles
  for each row execute function app.audit_row_change('organisation_id');
alter table public.provider_profiles enable row level security;
revoke all on public.provider_profiles from anon, authenticated;
grant select on public.provider_profiles to authenticated;
-- The provider's own members, and HVEMS verification staff. Posters see a public summary through functions.
create policy provider_profiles_read on public.provider_profiles for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
  or (select app.has_platform_authority('verification_officer'))
  or (select app.is_platform_staff()));

create or replace function public.save_provider_profile(p_organisation_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.organisation_kind;
  v_regions text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'region_codes', '[]')) x), '{}');
  v_cats text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) x), '{}');
begin
  perform app.require_capability(p_organisation_id, 'provider.profile.manage');
  select kind into v_kind from public.organisations where id = p_organisation_id;
  if v_kind is distinct from 'provider' then
    perform app.raise('not_a_provider', 'Only provider accounts have a provider profile');
  end if;
  if not app.provider_categories_valid(v_cats) then
    perform app.raise('invalid_category', 'Choose service categories from the list');
  end if;
  if exists (select 1 from unnest(v_regions) r where not exists (select 1 from public.marketplace_regions m where m.code = r)) then
    perform app.raise('invalid_region', 'Choose regions from the list');
  end if;
  insert into public.provider_profiles as pp (organisation_id, description, contact_name, contact_phone, contact_email, categories, asset_class_codes,
    region_codes, base_suburb, base_postcode, radius_km, mobile_service, workshop_address, hours, accepting_urgent, unavailable_dates)
  values (
    p_organisation_id,
    nullif(btrim(coalesce(p ->> 'description', '')), ''),
    nullif(btrim(coalesce(p ->> 'contact_name', '')), ''),
    nullif(btrim(coalesce(p ->> 'contact_phone', '')), ''),
    nullif(lower(btrim(coalesce(p ->> 'contact_email', ''))), ''),
    v_cats,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'asset_class_codes', '[]')) x), '{}'),
    v_regions,
    nullif(btrim(coalesce(p ->> 'base_suburb', '')), ''),
    nullif(btrim(coalesce(p ->> 'base_postcode', '')), ''),
    nullif(p ->> 'radius_km', '')::integer,
    coalesce((p ->> 'mobile_service')::boolean, false),
    nullif(btrim(coalesce(p ->> 'workshop_address', '')), ''),
    nullif(btrim(coalesce(p ->> 'hours', '')), ''),
    coalesce((p ->> 'accepting_urgent')::boolean, false),
    coalesce((select array_agg(x::date) from jsonb_array_elements_text(coalesce(p -> 'unavailable_dates', '[]')) x), '{}')
  )
  on conflict (organisation_id) do update set
    description = excluded.description, contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
    contact_email = excluded.contact_email, categories = excluded.categories, asset_class_codes = excluded.asset_class_codes,
    region_codes = excluded.region_codes, base_suburb = excluded.base_suburb, base_postcode = excluded.base_postcode,
    radius_km = excluded.radius_km, mobile_service = excluded.mobile_service, workshop_address = excluded.workshop_address,
    hours = excluded.hours, accepting_urgent = excluded.accepting_urgent, unavailable_dates = excluded.unavailable_dates,
    updated_at = now();
end $$;
revoke execute on function public.save_provider_profile(uuid, jsonb) from public, anon;
grant execute on function public.save_provider_profile(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification documents and badges (MKT-02)
-- ---------------------------------------------------------------------------
create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind text not null check (kind in ('public_liability', 'qualification', 'licence', 'other')),
  category text check (category is null or app.provider_categories_valid(array[category])),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 26214400),
  expires_on date,
  uploaded_by uuid not null references auth.users (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  superseded_at timestamptz,
  warned_30_at timestamptz,
  warned_7_at timestamptz,
  unique (id, organisation_id)
);
create index provider_documents_org_idx on public.provider_documents (organisation_id, uploaded_at desc);
create index provider_documents_uploaded_by_idx on public.provider_documents (uploaded_by);
create trigger audit_provider_documents after insert or update or delete on public.provider_documents
  for each row execute function app.audit_row_change('organisation_id');
alter table public.provider_documents enable row level security;
revoke all on public.provider_documents from anon, authenticated;
grant select on public.provider_documents to authenticated;
create policy provider_documents_read on public.provider_documents for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.view'))::uuid[])
  or (select app.has_platform_authority('verification_officer'))
  or (select app.is_platform_staff()));

create or replace function public.add_provider_document(
  p_organisation_id uuid, p_kind text, p_category text, p_title text, p_path text, p_file_name text,
  p_content_type text default null, p_size_bytes bigint default null, p_expires_on date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.require_capability(p_organisation_id, 'provider.profile.manage');
  if left(coalesce(p_path, ''), 37) <> p_organisation_id::text || '/' or p_path like '%..%' then
    perform app.raise('invalid_path', 'The file was not uploaded for this provider');
  end if;
  if p_kind = 'public_liability' and p_expires_on is null then
    perform app.raise('expiry_required', 'Enter the certificate''s expiry date');
  end if;
  insert into public.provider_documents (organisation_id, kind, category, title, path, file_name, content_type, size_bytes, expires_on)
  values (p_organisation_id, p_kind, nullif(p_category, ''), btrim(p_title), p_path, p_file_name, p_content_type, p_size_bytes, p_expires_on)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.add_provider_document(uuid, text, text, text, text, text, text, bigint, date) from public, anon;
grant execute on function public.add_provider_document(uuid, text, text, text, text, text, text, bigint, date) to authenticated, service_role;

create or replace function public.retire_provider_document(p_document_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.provider_documents%rowtype;
begin
  select * into d from public.provider_documents where id = p_document_id for update;
  if d.id is null then perform app.raise('not_found', 'Document not found'); end if;
  perform app.require_capability(d.organisation_id, 'provider.profile.manage');
  update public.provider_documents set superseded_at = coalesce(superseded_at, now()) where id = d.id;
end $$;
revoke execute on function public.retire_provider_document(uuid) from public, anon;
grant execute on function public.retire_provider_document(uuid) to authenticated, service_role;

-- What HVEMS checked (MKT-02). Created only by a verification decision.
create table public.provider_badges (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind text not null check (kind in ('abn', 'public_liability', 'qualification')),
  category text,
  document_id uuid,
  details text not null check (char_length(details) between 3 and 500),
  cover_cents bigint check (cover_cents is null or cover_cents >= 0),
  checked_by uuid not null references auth.users (id),
  checked_at timestamptz not null default now(),
  expires_on date,
  revoked_at timestamptz,
  revoked_reason text,
  foreign key (document_id, organisation_id) references public.provider_documents (id, organisation_id)
);
create index provider_badges_org_idx on public.provider_badges (organisation_id);
create index provider_badges_checked_by_idx on public.provider_badges (checked_by);
create index provider_badges_document_idx on public.provider_badges (document_id, organisation_id);
create trigger audit_provider_badges after insert or update or delete on public.provider_badges
  for each row execute function app.audit_row_change('organisation_id');
alter table public.provider_badges enable row level security;
revoke all on public.provider_badges from anon, authenticated;
-- Badges are public to signed-in users (posters compare them, MKT-10).
grant select on public.provider_badges to authenticated;
create policy provider_badges_read on public.provider_badges for select to authenticated using (true);

-- Submit for verification: needs the ABN, one category, a service area and a current insurance certificate.
create or replace function public.submit_provider_verification(p_organisation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.provider_profiles%rowtype;
  v_abn text;
begin
  perform app.require_capability(p_organisation_id, 'provider.verification.submit');
  select abn into v_abn from public.organisations where id = p_organisation_id;
  select * into p from public.provider_profiles where organisation_id = p_organisation_id for update;
  if p.organisation_id is null then
    perform app.raise('profile_required', 'Complete your profile first');
  end if;
  if v_abn is null then perform app.raise('abn_required', 'Add your ABN'); end if;
  if cardinality(p.categories) = 0 then perform app.raise('category_required', 'Choose at least one service category'); end if;
  if cardinality(p.region_codes) = 0 and (p.base_suburb is null or p.radius_km is null) then
    perform app.raise('service_area_required', 'Set your service area: regions, or a base suburb and radius');
  end if;
  if not exists (select 1 from public.provider_documents where organisation_id = p_organisation_id and kind = 'public_liability'
                 and superseded_at is null and expires_on >= (now() at time zone 'Australia/Brisbane')::date) then
    perform app.raise('insurance_required', 'Upload your current public liability certificate');
  end if;
  if p.status in ('submitted', 'suspended') then
    perform app.raise('invalid_status', case p.status when 'submitted' then 'Already waiting for review' else 'Your account is suspended' end);
  end if;
  update public.provider_profiles set status = 'submitted', submitted_at = now(), updated_at = now() where organisation_id = p_organisation_id;
end $$;
revoke execute on function public.submit_provider_verification(uuid) from public, anon;
grant execute on function public.submit_provider_verification(uuid) to authenticated, service_role;

-- The Verification Officer's decision (O-01: the ABN is checked by hand and recorded).
create or replace function public.decide_provider_verification(
  p_organisation_id uuid,
  p_approve boolean,
  p_reason text default null,
  p_abn_active boolean default false,
  p_abn_name_matches boolean default false,
  p_insurance_document_id uuid default null,
  p_insurance_cover_cents bigint default null,
  p_qualification_document_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.provider_profiles%rowtype;
  o public.organisations%rowtype;
  d public.provider_documents%rowtype;
  q uuid;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if not app.has_platform_authority('verification_officer') then
    perform app.raise('forbidden', 'Only a Verification Officer decides verification');
  end if;
  select * into p from public.provider_profiles where organisation_id = p_organisation_id for update;
  select * into o from public.organisations where id = p_organisation_id;
  if p.organisation_id is null then perform app.raise('not_found', 'Provider not found'); end if;
  if p.status <> 'submitted' then perform app.raise('invalid_status', 'This provider is not waiting for review'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 and not p_approve then
    perform app.raise('reason_required', 'Give the reason for rejecting');
  end if;

  if p_approve then
    if not (p_abn_active and p_abn_name_matches) then
      perform app.raise('abn_not_confirmed', 'Confirm the ABN is active and matches the business name');
    end if;
    select * into d from public.provider_documents where id = p_insurance_document_id and organisation_id = p_organisation_id
      and kind = 'public_liability' and superseded_at is null;
    if d.id is null or d.expires_on is null or d.expires_on < v_today then
      perform app.raise('insurance_invalid', 'Choose a current public liability certificate');
    end if;
    -- Earlier badges are replaced by this decision.
    update public.provider_badges set revoked_at = now(), revoked_reason = 'Replaced by a new verification'
      where organisation_id = p_organisation_id and revoked_at is null;
    insert into public.provider_badges (organisation_id, kind, details, checked_by)
    values (p_organisation_id, 'abn', format('ABN %s checked: active and matches %s', o.abn, coalesce(o.legal_name, o.name)), auth.uid());
    insert into public.provider_badges (organisation_id, kind, document_id, details, cover_cents, checked_by, expires_on)
    values (p_organisation_id, 'public_liability', d.id,
            format('Public liability certificate checked%s, expires %s',
                   case when p_insurance_cover_cents is not null then ', cover $' || to_char(p_insurance_cover_cents / 100.0, 'FM999G999G999G990') else '' end,
                   to_char(d.expires_on, 'DD/MM/YYYY')),
            p_insurance_cover_cents, auth.uid(), d.expires_on);
    foreach q in array coalesce(p_qualification_document_ids, '{}') loop
      select * into d from public.provider_documents where id = q and organisation_id = p_organisation_id
        and kind in ('qualification', 'licence') and superseded_at is null;
      if d.id is null then perform app.raise('invalid_document', 'A qualification document was not found'); end if;
      insert into public.provider_badges (organisation_id, kind, category, document_id, details, checked_by, expires_on)
      values (p_organisation_id, 'qualification', d.category, d.id, format('%s checked', d.title), auth.uid(), d.expires_on);
    end loop;
  end if;

  update public.provider_profiles
  set status = case when p_approve then 'verified' else 'rejected' end,
      decided_at = now(), decided_by = auth.uid(), decision_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now()
  where organisation_id = p_organisation_id;
  perform app.audit(case when p_approve then 'verify' else 'reject' end, 'provider_profiles', null, p_organisation_id,
    jsonb_build_object('abn_active', p_abn_active, 'abn_name_matches', p_abn_name_matches, 'reason', p_reason,
                       'qualifications', coalesce(cardinality(p_qualification_document_ids), 0)));
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p_organisation_id, m.user_id, 'provider_verification',
         case when p_approve then 'Your business is verified' else 'Verification not approved' end,
         case when p_approve then 'You can now propose on marketplace jobs once billing is set up.' else 'Reason: ' || btrim(p_reason) end,
         'profile'
  from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager');
end $$;
revoke execute on function public.decide_provider_verification(uuid, boolean, text, boolean, boolean, uuid, bigint, uuid[]) from public, anon;
grant execute on function public.decide_provider_verification(uuid, boolean, text, boolean, boolean, uuid, bigint, uuid[]) to authenticated, service_role;

-- Suspend or reinstate (Platform Administrator), with a reason.
create or replace function public.set_provider_suspended(p_organisation_id uuid, p_suspended boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.provider_profiles%rowtype;
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Platform Administrator suspends providers');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give a reason'); end if;
  select * into p from public.provider_profiles where organisation_id = p_organisation_id for update;
  if p.organisation_id is null then perform app.raise('not_found', 'Provider not found'); end if;
  update public.provider_profiles
  set status = case when p_suspended then 'suspended'
                    when exists (select 1 from public.provider_badges b where b.organisation_id = p_organisation_id and b.revoked_at is null and b.kind = 'abn') then 'verified'
                    else 'draft' end,
      suspended_reason = case when p_suspended then btrim(p_reason) else null end, updated_at = now()
  where organisation_id = p_organisation_id;
  perform app.audit(case when p_suspended then 'suspend' else 'reinstate' end, 'provider_profiles', null, p_organisation_id, jsonb_build_object('reason', btrim(p_reason)));
end $$;
revoke execute on function public.set_provider_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.set_provider_suspended(uuid, boolean, text) to authenticated, service_role;

-- MKT-03: why a provider can't propose (null = can). Each reason is shown to the provider.
create or replace function app.provider_proposal_block(p_organisation_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p.organisation_id is null or p.status in ('draft', 'rejected') then 'Get verified to submit proposals'
    when p.status = 'submitted' then 'Your verification is being reviewed'
    when p.status = 'suspended' then 'Your account is suspended'
    when not exists (select 1 from public.provider_badges b where b.organisation_id = p.organisation_id and b.kind = 'public_liability'
                     and b.revoked_at is null and b.expires_on >= (now() at time zone 'Australia/Brisbane')::date)
      then 'Your public liability insurance has expired. Upload the new certificate for verification'
    else null
  end
  from (select 1) one
  left join public.provider_profiles p on p.organisation_id = p_organisation_id
$$;
grant execute on function app.provider_proposal_block(uuid) to authenticated, service_role;

create or replace function public.provider_proposal_block(p_organisation_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_capability(p_organisation_id, 'org.view');
  return app.provider_proposal_block(p_organisation_id);
end $$;
revoke execute on function public.provider_proposal_block(uuid) from public, anon;
grant execute on function public.provider_proposal_block(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notifications: marketplace kinds and an in-portal link
-- ---------------------------------------------------------------------------
alter table public.notifications add column link_path text check (link_path is null or (link_path !~ '^[a-z]+://' and char_length(link_path) <= 300));
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed', 'meter_reading_review', 'parts_approval', 'parts_decision', 'document_expiring',
  'provider_verification', 'provider_document_expiring', 'marketplace_job', 'marketplace_message', 'marketplace_proposal'));

-- Reminders 30 and 7 days before a provider document expires (MKT-02, NOT-08).
create or replace function app.notify_provider_document_expiry() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_n integer := 0;
begin
  for d in select * from public.provider_documents
           where superseded_at is null and expires_on is not null and expires_on >= v_today
             and ((expires_on <= v_today + 30 and warned_30_at is null) or (expires_on <= v_today + 7 and warned_7_at is null)) loop
    insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
    select d.organisation_id, m.user_id, 'provider_document_expiring',
           format('%s expires %s', d.title, to_char(d.expires_on, 'DD/MM/YYYY')),
           case when d.kind = 'public_liability' then 'Upload the renewed certificate: you can''t propose once insurance expires.' else 'Upload the renewed document.' end,
           'profile'
    from public.org_memberships m
    where m.organisation_id = d.organisation_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager');
    update public.provider_documents
    set warned_30_at = coalesce(warned_30_at, now()), warned_7_at = case when d.expires_on <= v_today + 7 then now() else warned_7_at end
    where id = d.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hvems-provider-document-expiry', '15 21 * * *', 'select app.notify_provider_document_expiry()');
  end if;
end $do$;

-- Private bucket; path <provider organisation>/<file>. Skipped where storage doesn't exist (tests).
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('provider-documents', 'provider-documents', false, 26214400,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do nothing;
    execute $p$
      create policy provider_documents_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'provider-documents' and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('provider.profile.manage'))::text[])
      )$p$;
    execute $p$
      create policy provider_documents_view on storage.objects for select to authenticated using (
        bucket_id = 'provider-documents'
        and ((storage.foldername(name))[1] = any ((select app.orgs_with_capability('org.view'))::text[])
             or (select app.has_platform_authority('verification_officer'))
             or (select app.is_platform_staff()))
      )$p$;
  end if;
end $do$;
