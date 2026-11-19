-- 2D Marketplace part 1: regions, provider profiles and verification (MKT-01..03, MKT-25, O-01).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.pv@example.test', 'Paula Provider') as powner \gset
select tests.create_user('tech.pv@example.test', 'Tim ProTech') as ptech \gset
select tests.create_user('vo.pv@example.test', 'Vera Verifier') as vo \gset
select tests.create_user('agent.pv@example.test', 'Andy Agent') as agent \gset
select tests.create_user('co.pv@example.test', 'Cora Company') as cowner \gset
insert into public.platform_staff (user_id, role, authorities) values (:'vo', 'support_agent', array['verification_officer']::public.platform_authority[]),
  (:'agent', 'support_agent', '{}');

select tests.authenticate_as(:'powner');
select public.create_organisation('provider', 'Pine Rivers Diesel', '51 824 753 556') as prov \gset
reset role;
select tests.add_member(:'prov', :'ptech', 'provider_technician') as ptech_m \gset
select tests.authenticate_as(:'cowner');
select public.create_organisation('company', 'Haulage Co') as co \gset
reset role;

-- Regions (MKT-25)
select ok((select open from public.marketplace_regions where code = 'moreton_bay'), 'Moreton Bay is open at launch');
select tests.authenticate_as(:'cowner');
select is(tests.error_code($$select public.set_marketplace_region('noosa', 'Noosa', true)$$), 'forbidden', 'customers cannot open regions');
select lives_ok(format($$select public.register_region_interest(%L, 'Gympie', '4570', 'Fleet of 12')$$, :'co'), 'a poster registers interest outside open regions');
reset role;

-- Profile (MKT-01)
select tests.authenticate_as(:'powner');
select is(tests.error_code(format($$select public.save_provider_profile(%L, '{"categories": ["plumbing"]}')$$, :'prov')), 'invalid_category', 'categories come from the list');
select is(tests.error_code(format($$select public.save_provider_profile(%L, '{"categories": ["tyres"], "region_codes": ["atlantis"]}')$$, :'prov')), 'invalid_region', 'regions come from the list');
select lives_ok(format($$select public.save_provider_profile(%L, '{"categories": ["diesel_mechanical", "hydraulics"], "region_codes": ["moreton_bay", "brisbane"], "mobile_service": true, "accepting_urgent": true, "contact_phone": "0400 000 000"}')$$, :'prov'),
  'the Provider Owner saves the profile');
select is(tests.error_code(format($$select public.submit_provider_verification(%L)$$, :'prov')), 'insurance_required', 'verification needs a current insurance certificate');
select is(tests.error_code(format($$select public.add_provider_document(%L, 'public_liability', null, 'PL certificate', %L, 'pl.pdf')$$, :'prov', :'prov' || '/pl.pdf')), 'expiry_required',
  'an insurance certificate needs its expiry date');
select is(tests.error_code(format($$select public.add_provider_document(%L, 'public_liability', null, 'PL', 'other-org/pl.pdf', 'pl.pdf', null, null, current_date + 200)$$, :'prov')), 'invalid_path',
  'files must be in the provider''s folder');
select public.add_provider_document(:'prov', 'public_liability', null, 'Public liability 2026-27', :'prov' || '/pl.pdf', 'pl.pdf', 'application/pdf', 1000, current_date + 200) as pl \gset
select public.add_provider_document(:'prov', 'qualification', 'mobile_plant', 'Heavy plant mechanic certificate', :'prov' || '/q.pdf', 'q.pdf') as qual \gset
select is((select count(*) from public.provider_badges where organisation_id = :'prov')::int, 0, 'uploading a document never creates a badge');
select is(public.provider_proposal_block(:'prov'), 'Get verified to submit proposals', 'an unverified provider cannot propose, and is told why');
select lives_ok(format($$select public.submit_provider_verification(%L)$$, :'prov'), 'submitted for verification');
reset role;

select tests.authenticate_as(:'ptech');
select is(tests.error_code(format($$select public.save_provider_profile(%L, '{}')$$, :'prov')), 'forbidden', 'Provider Technicians cannot edit the profile');
reset role;

-- Decision (MKT-02, O-01)
select tests.authenticate_as(:'agent', 'aal2');
select is(tests.error_code(format($$select public.decide_provider_verification(%L, true)$$, :'prov')), 'forbidden', 'a support agent without the authority cannot verify');
reset role;
select tests.authenticate_as(:'vo', 'aal2');
select is(tests.error_code(format($$select public.decide_provider_verification(%L, true, null, true, false, %L)$$, :'prov', :'pl')), 'abn_not_confirmed',
  'approval needs the ABN confirmed active and matching');
select is(tests.error_code(format($$select public.decide_provider_verification(%L, false, '')$$, :'prov')), 'reason_required', 'rejecting needs a reason');
select lives_ok(format($$select public.decide_provider_verification(%L, true, null, true, true, %L, 2000000000, array[%L]::uuid[])$$, :'prov', :'pl', :'qual'),
  'the Verification Officer approves');
reset role;
select is((select status from public.provider_profiles where organisation_id = :'prov'), 'verified', 'the provider is verified');
select is((select count(*) from public.provider_badges where organisation_id = :'prov' and revoked_at is null)::int, 3, 'badges for the ABN, insurance and qualification');
select ok((select bool_and(checked_by = :'vo'::uuid) from public.provider_badges where organisation_id = :'prov'), 'each badge records who checked it');
select ok(exists (select 1 from public.notifications where recipient_id = :'powner' and kind = 'provider_verification'), 'the provider is told');

select tests.authenticate_as(:'powner');
select is(public.provider_proposal_block(:'prov'), null, 'a verified provider with current insurance can propose');
reset role;

-- Expired insurance blocks proposals automatically
update public.provider_badges set expires_on = current_date - 1 where organisation_id = :'prov' and kind = 'public_liability';
select tests.authenticate_as(:'powner');
select ok(public.provider_proposal_block(:'prov') like 'Your public liability insurance has expired%', 'expired insurance blocks proposals');
reset role;

-- Company members can't read a provider's private profile
select tests.authenticate_as(:'cowner');
select is((select count(*) from public.provider_profiles)::int, 0, 'posters cannot read private provider profiles');
select ok((select count(*) from public.provider_badges where organisation_id = :'prov') > 0, 'but can see badges');
reset role;

select * from finish();
rollback;
