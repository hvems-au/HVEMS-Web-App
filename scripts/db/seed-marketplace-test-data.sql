-- =============================================================================
-- Marketplace test data for the DEVELOPMENT database only. Run once in the
-- Supabase SQL editor after the 2D migrations (through 20261122150000).
-- Refuses to run unless MFA enforcement is off (true only in development) and
-- does nothing if the test customer already exists.
--
-- Creates:
--  * customer@hvems.com.au  "Test Customer - Account Owner", with the password you type
--    into v_password below (it is not stored in this file)
--    with the marketplace-only account "Test Customer (Marketplace)".
--  * HVEMS Test Provider: profile, insurance certificate, verified with badges.
--  * Omnific Developers: a provider profile waiting for verification (approve it
--    in the console, then it can quote from the company portal's Find work).
--  * Six open or engaged jobs from the test customer and the company, proposals
--    from the test provider, a masked question with a reply, and one confirmed
--    engagement.
-- The uploaded-file rows point at placeholder paths: those files don't exist, so
-- their links won't open. Upload real ones from the screens to test files.
-- =============================================================================
do $seed$
declare
  -- Type the test customer's password here before running. Don't commit it.
  v_password text := '';
  v_super uuid := (select id from auth.users where email = 'ahmad.khattak@omnificit.com.au');
  v_owner uuid := (select id from auth.users where email = 'ahmad.khattak@omnificdevelopers.com');
  v_prov_user uuid := (select id from auth.users where email = 'provider@hvems.com.au');
  v_co uuid := (select id from public.organisations where name = 'Omnific Developers' and kind = 'company' limit 1);
  v_prov uuid;
  v_cust_user uuid := gen_random_uuid();
  v_cust uuid;
  v_doc uuid;
  v_asset1 uuid;
  v_asset2 uuid;
  v_wo uuid;
  v_num integer;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid; j5 uuid; j6 uuid;
  p uuid;
  v uuid;
  m uuid;
begin
  if char_length(v_password) < 8 then
    raise exception 'Set v_password (at least 8 characters) at the top of the script first.';
  end if;
  if coalesce((select value #>> '{}' from public.platform_settings where key = 'security.mfa_enforced'), 'true') <> 'false' then
    raise exception 'This test data is for the development database only (MFA enforcement is on here).';
  end if;
  select o.id into v_prov from public.organisations o join public.org_memberships mm on mm.organisation_id = o.id
  where mm.user_id = v_prov_user and o.kind = 'provider' limit 1;
  if v_super is null or v_owner is null or v_prov_user is null or v_co is null or v_prov is null then
    raise exception 'Expected development accounts not found (Super Admin, Owner, provider@hvems.com.au, Omnific Developers, HVEMS Test Provider).';
  end if;
  if exists (select 1 from public.organisations where name = 'Test Customer (Marketplace)') then
    raise notice 'Marketplace test data already present; nothing done.';
    return;
  end if;

  -- 1. Test marketplace-only customer --------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_cust_user, 'authenticated', 'authenticated', 'customer@hvems.com.au',
          extensions.crypt(v_password, extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}',
          '{"full_name": "Test Customer - Account Owner"}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_cust_user, v_cust_user::text,
          jsonb_build_object('sub', v_cust_user::text, 'email', 'customer@hvems.com.au', 'email_verified', true), 'email', now(), now(), now());
  update public.profiles set full_name = 'Test Customer - Account Owner' where id = v_cust_user;
  insert into public.organisations (kind, name, created_by) values ('marketplace_customer', 'Test Customer (Marketplace)', v_cust_user) returning id into v_cust;
  insert into public.org_memberships (organisation_id, user_id, role) values (v_cust, v_cust_user, 'account_owner');

  -- 2. HVEMS Test Provider: verified ---------------------------------------------------------------
  insert into public.provider_profiles (organisation_id, description, contact_name, contact_phone, contact_email, categories, region_codes,
    base_suburb, base_postcode, radius_km, mobile_service, workshop_address, hours, accepting_urgent, status, submitted_at, decided_at, decided_by)
  values (v_prov, 'Mobile heavy diesel, hydraulics and tyres across Moreton Bay and north Brisbane. Test provider for HVEMS development.',
    'Test Provider - Provider Owner', '0400 000 001', 'provider@hvems.com.au',
    array['diesel_mechanical', 'hydraulics', 'tyres', 'auto_electrical'], array['moreton_bay', 'brisbane', 'sunshine_coast'],
    'Strathpine', '4500', 80, true, '1 Test Street, Strathpine QLD 4500', 'Mon–Fri 6am–5pm, Sat 7am–12pm', true,
    'verified', now() - interval '3 days', now() - interval '2 days', v_super)
  on conflict (organisation_id) do update set categories = excluded.categories, region_codes = excluded.region_codes, accepting_urgent = true,
    mobile_service = true, status = 'verified', decided_at = excluded.decided_at, decided_by = v_super;
  insert into public.provider_documents (organisation_id, kind, title, path, file_name, content_type, expires_on, uploaded_by)
  values (v_prov, 'public_liability', 'Public liability certificate 2026–27 (test)', v_prov::text || '/seed-public-liability.pdf', 'seed-public-liability.pdf',
          'application/pdf', current_date + 300, v_prov_user)
  returning id into v_doc;
  update public.provider_badges set revoked_at = now(), revoked_reason = 'Replaced by test data' where organisation_id = v_prov and revoked_at is null;
  insert into public.provider_badges (organisation_id, kind, details, checked_by, checked_at)
  values (v_prov, 'abn', 'ABN checked: active and matches the business name (test data)', v_super, now() - interval '2 days');
  insert into public.provider_badges (organisation_id, kind, document_id, details, cover_cents, checked_by, checked_at, expires_on)
  values (v_prov, 'public_liability', v_doc, format('Public liability certificate checked, cover $20,000,000, expires %s', to_char(current_date + 300, 'DD/MM/YYYY')),
          2000000000, v_super, now() - interval '2 days', current_date + 300);

  -- 3. Omnific Developers also works as a provider: waiting for verification ----------------------
  if (select abn from public.organisations where id = v_co) is null then
    update public.organisations set abn = '98999999967' where id = v_co;  -- checksum-valid test ABN
  end if;
  insert into public.provider_profiles (organisation_id, description, categories, region_codes, mobile_service, accepting_urgent, status, submitted_at)
  values (v_co, 'Our workshop also takes outside diesel and auto-electrical work (test data).', array['diesel_mechanical', 'auto_electrical'],
          array['moreton_bay', 'brisbane'], true, false, 'submitted', now() - interval '1 hour')
  on conflict (organisation_id) do nothing;
  insert into public.provider_documents (organisation_id, kind, title, path, file_name, content_type, expires_on, uploaded_by)
  values (v_co, 'public_liability', 'Public liability certificate (test)', v_co::text || '/seed-public-liability.pdf', 'seed-public-liability.pdf',
          'application/pdf', current_date + 200, v_owner)
  on conflict (path) do nothing;

  -- 4. Jobs from the test customer -----------------------------------------------------------------
  insert into public.marketplace_jobs (organisation_id, title, description, category, job_type, urgency, shared_asset, region_code, suburb, postcode,
    address, site_access_notes, posted_by, posted_at, closes_at)
  values (v_cust, 'Prime mover won''t start at the depot', 'Kenworth cranks but won''t fire. Fuel gauge shows half a tank. Needed back on the road today. (Test job)',
    'diesel_mechanical', 'breakdown_repair', 'urgent', '{"class": "Prime mover", "make": "Kenworth", "model": "T610", "registration": "TEST01"}',
    'moreton_bay', 'Caboolture', '4510', '12 Test Road, Caboolture QLD 4510', 'Gate code 1234. Hi-vis and steel caps. Sign in at the office.',
    v_cust_user, now() - interval '25 minutes', now() + interval '23 hours')
  returning id into j1;
  insert into public.marketplace_jobs (organisation_id, title, description, category, job_type, urgency, shared_asset, region_code, suburb, postcode,
    address, posted_by, posted_at, closes_at, budget_min_cents, budget_max_cents, preferred_from, preferred_to)
  values (v_cust, 'Replace two rear tyres on the tipper', 'Both rear outer tyres are worn to the wear bars. Tyres to be supplied by the provider. (Test job)',
    'tyres', 'planned_service', 'standard', '{"class": "Tipper truck", "make": "Isuzu", "model": "FVZ", "registration": "TEST02"}',
    'brisbane', 'Brendale', '4500', '5 Test Court, Brendale QLD 4500', v_cust_user, now() - interval '2 days', now() + interval '12 days',
    80000, 150000, current_date + 3, current_date + 7)
  returning id into j2;
  insert into public.marketplace_jobs (organisation_id, title, description, category, job_type, urgency, shared_asset, region_code, suburb, postcode,
    address, site_access_notes, posted_by, posted_at, closes_at, preferred_from)
  values (v_cust, 'Hydraulic hose burst on the excavator', 'Boom hose burst near the quick coupler. Machine parked, oil cleaned up. (Test job)',
    'hydraulics', 'breakdown_repair', 'standard', '{"class": "Excavator", "make": "Hitachi", "model": "ZX135", "description": "13-tonne excavator"}',
    'moreton_bay', 'Narangba', '4504', 'Lot 9 Test Quarry Road, Narangba QLD 4504', 'Quarry induction needed: 15 minutes at the weighbridge.',
    v_cust_user, now() - interval '1 day', now() + interval '13 days', current_date + 1)
  returning id into j3;
  insert into public.marketplace_jobs (organisation_id, title, description, category, job_type, urgency, shared_asset, region_code, suburb, postcode,
    address, site_access_notes, posted_by, posted_at, closes_at, status, preferred_from)
  values (v_cust, 'Annual service on the skid steer', '500-hour service: oils, filters and a general check. (Test job)',
    'diesel_mechanical', 'planned_service', 'standard', '{"class": "Skid steer", "make": "Bobcat", "model": "S70", "registration": "TEST04"}',
    'moreton_bay', 'Morayfield', '4506', '30 Test Street, Morayfield QLD 4506', 'Machine is in shed 2. Key in the lockbox, code 5678.',
    v_cust_user, now() - interval '4 days', now() + interval '10 days', 'engaged', current_date + 2)
  returning id into j4;

  -- 5. Jobs from Omnific Developers, each with its marketplace work order -------------------------
  select id into v_asset1 from public.assets where organisation_id = v_co and archived_at is null order by created_at limit 1;
  select id into v_asset2 from public.assets where organisation_id = v_co and archived_at is null order by created_at offset 1 limit 1;
  if v_asset1 is not null then
    select coalesce(max(number), 0) + 1 into v_num from public.work_orders where organisation_id = v_co;
    insert into public.work_orders (organisation_id, number, asset_id, title, description, kind, priority, created_by)
    values (v_co, v_num, v_asset1, 'Alternator not charging', 'Battery light on; voltage drops under load.', 'marketplace', 'high', v_owner) returning id into v_wo;
    insert into public.marketplace_jobs (organisation_id, work_order_id, asset_id, title, description, category, job_type, urgency, shared_asset, region_code,
      suburb, postcode, address, posted_by, posted_at, closes_at)
    select v_co, v_wo, a.id, 'Alternator not charging', 'Battery light comes on and voltage drops under load. Needs diagnosis and repair. (Test job)',
      'auto_electrical', 'breakdown_repair', 'standard', jsonb_strip_nulls(jsonb_build_object('make', a.make, 'model', a.model)),
      'moreton_bay', 'North Lakes', '4509', '1 Test Avenue, North Lakes QLD 4509', v_owner, now() - interval '6 hours', now() + interval '14 days'
    from public.assets a where a.id = v_asset1
    returning id into j5;
  end if;
  if v_asset2 is not null then
    select coalesce(max(number), 0) + 1 into v_num from public.work_orders where organisation_id = v_co;
    insert into public.work_orders (organisation_id, number, asset_id, title, description, kind, priority, created_by)
    values (v_co, v_num, v_asset2, 'Hydraulic leak on the loader', 'Weeping from the lift cylinder seal.', 'marketplace', 'normal', v_owner) returning id into v_wo;
    insert into public.marketplace_jobs (organisation_id, work_order_id, asset_id, title, description, category, job_type, urgency, shared_asset, region_code,
      suburb, postcode, address, posted_by, posted_at, closes_at, budget_max_cents)
    select v_co, v_wo, a.id, 'Hydraulic leak on the loader', 'Lift cylinder seal is weeping. Reseal or replace the cylinder. (Test job)',
      'hydraulics', 'breakdown_repair', 'standard', jsonb_strip_nulls(jsonb_build_object('make', a.make, 'model', a.model)),
      'moreton_bay', 'North Lakes', '4509', '1 Test Avenue, North Lakes QLD 4509', v_owner, now() - interval '1 day', now() + interval '13 days', 250000
    from public.assets a where a.id = v_asset2
    returning id into j6;
  end if;

  -- 6. Proposals from HVEMS Test Provider ----------------------------------------------------------
  -- Urgent breakdown: arrival in 45 minutes, valid 60 minutes.
  insert into public.marketplace_proposals (job_id, provider_id, valid_until, submitted_at) values (j1, v_prov, now() + interval '50 minutes', now() - interval '10 minutes') returning id into p;
  insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, hourly_rate_cents, callout_cents, gst_applies, arrival_minutes, valid_until,
    inclusions, fee_cents, fee_consented_at, created_by)
  values (p, 1, 'hourly', 14500, 18000, true, 45, now() + interval '50 minutes', 'Diagnosis on site; common fuel-system parts carried on the van.', 4900, now() - interval '10 minutes', v_prov_user);
  -- Tyres: fixed price, revised once.
  insert into public.marketplace_proposals (job_id, provider_id, version, valid_until, submitted_at) values (j2, v_prov, 2, now() + interval '3 days', now() - interval '1 day') returning id into p;
  insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, gst_applies, available_from, available_to, valid_until,
    inclusions, exclusions, fee_cents, fee_consented_at, created_by, created_at)
  values (p, 1, 'fixed', 132000, true, current_date + 3, current_date + 5, now() + interval '2 days', 'Two 11R22.5 drive tyres, fitting and balancing.', 'Wheel alignment.', 2900,
          now() - interval '1 day', v_prov_user, now() - interval '1 day'),
         (p, 2, 'fixed', 124000, true, current_date + 3, current_date + 5, now() + interval '3 days', 'Two 11R22.5 drive tyres, fitting and balancing.', 'Wheel alignment.', 2900,
          now() - interval '2 hours', v_prov_user, now() - interval '2 hours');
  -- Hydraulic hose: estimate range.
  insert into public.marketplace_proposals (job_id, provider_id, valid_until, submitted_at) values (j3, v_prov, now() + interval '3 days', now() - interval '20 hours') returning id into p;
  insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, amount_max_cents, gst_applies, available_from, valid_until,
    assumptions, fee_cents, fee_consented_at, created_by)
  values (p, 1, 'estimate', 45000, 90000, true, current_date + 1, now() + interval '3 days', 'Hose made up on site; price depends on fittings needed.', 2900, now() - interval '20 hours', v_prov_user);
  -- Skid steer service: accepted, engagement confirmed.
  insert into public.marketplace_proposals (job_id, provider_id, status, valid_until, submitted_at) values (j4, v_prov, 'accepted', now() + interval '1 day', now() - interval '3 days') returning id into p;
  insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, gst_applies, available_from, available_to, valid_until,
    inclusions, fee_cents, fee_consented_at, created_by)
  values (p, 1, 'fixed', 68000, true, current_date + 2, current_date + 4, now() + interval '1 day', 'Engine and hydraulic oils, all filters, grease and inspection report.', 2900,
          now() - interval '3 days', v_prov_user)
  returning id into v;
  insert into public.marketplace_engagements (job_id, organisation_id, provider_id, proposal_id, proposal_version_id, accepted_by, accepted_at, poster_fee_cents, provider_fee_cents, fee_status)
  values (j4, v_cust, v_prov, p, v, v_cust_user, now() - interval '2 days', 2900, 2900, 'not_live');
  -- Company jobs.
  if j5 is not null then
    insert into public.marketplace_proposals (job_id, provider_id, valid_until, submitted_at) values (j5, v_prov, now() + interval '3 days', now() - interval '2 hours') returning id into p;
    insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, gst_applies, available_from, valid_until, fee_cents, fee_consented_at, created_by)
    values (p, 1, 'fixed', 56000, true, current_date + 1, now() + interval '3 days', 2900, now() - interval '2 hours', v_prov_user);
  end if;
  if j6 is not null then
    insert into public.marketplace_proposals (job_id, provider_id, valid_until, submitted_at) values (j6, v_prov, now() + interval '3 days', now() - interval '5 hours') returning id into p;
    insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, amount_max_cents, gst_applies, available_from, valid_until, fee_cents, fee_consented_at, created_by)
    values (p, 1, 'estimate', 90000, 180000, true, current_date + 2, now() + interval '3 days', 2900, now() - interval '5 hours', v_prov_user);
  end if;

  -- 7. A question with contact details hidden, and the customer's reply --------------------------
  insert into public.marketplace_messages (job_id, provider_id, from_provider, sender_id, body, masked, created_at)
  values (j3, v_prov, true, v_prov_user, 'Which fitting is on the quick coupler end? Call me on [phone hidden] if easier.', true, now() - interval '21 hours')
  returning id into m;
  insert into public.marketplace_message_flags (message_id, original_body)
  values (m, 'Which fitting is on the quick coupler end? Call me on 0400 000 001 if easier.');
  insert into public.marketplace_messages (job_id, provider_id, from_provider, sender_id, body, created_at)
  values (j3, v_prov, false, v_cust_user, 'It''s a 3/4 inch JIC fitting. The coupler itself is fine.', now() - interval '20 hours');

  raise notice 'Marketplace test data added: customer@hvems.com.au, 6 jobs, 6 proposals, 1 engagement.';
end
$seed$;
