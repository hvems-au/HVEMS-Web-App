-- Decision O-13: a company also works the marketplace as a provider from the company portal.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.cp@example.test', 'Cam Owner') as aowner \gset
select tests.create_user('fm.cp@example.test', 'Fay Fleet') as afm \gset
select tests.create_user('tech.cp@example.test', 'Ted Tech') as atech \gset
select tests.create_user('fin.cp@example.test', 'Fin Finance') as afin \gset
select tests.create_user('owner2.cp@example.test', 'Bea Poster') as bowner \gset
select tests.create_user('vo.cp@example.test', 'Vi Verifier') as vo \gset
insert into public.platform_staff (user_id, role, authorities) values (:'vo', 'support_agent', array['verification_officer']::public.platform_authority[]);

-- Company A (will also be a provider) and company B (posts a job)
select tests.authenticate_as(:'aowner');
select public.create_organisation('company', 'Albany Creek Plant', '99 000 000 000') as a \gset
reset role;
select tests.add_member(:'a', :'afm', 'fleet_manager') as afm_m \gset
select tests.add_member(:'a', :'atech', 'technician') as atech_m \gset
select tests.add_member(:'a', :'afin', 'finance') as afin_m \gset
select tests.authenticate_as(:'bowner');
select public.create_organisation('company', 'Bray Park Haulage') as b \gset
reset role;
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values (:'b', 'BP-1', tests.class_id('excavator'), 'CAT', '320') returning id as basset \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values (:'a', 'AC-1', tests.class_id('excavator'), 'Komatsu', 'PC200') returning id as aasset \gset

-- Company A sets up its provider profile and is verified
select tests.authenticate_as(:'aowner');
select lives_ok(format($$select public.save_provider_profile(%L, '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"]}')$$, :'a'),
  'a company Owner saves a provider profile');
select public.add_provider_document(:'a', 'public_liability', null, 'PL', :'a' || '/pl.pdf', 'pl.pdf', null, null, current_date + 200) as apl \gset
select lives_ok(format($$select public.submit_provider_verification(%L)$$, :'a'), 'and submits it for verification');
reset role;
select tests.authenticate_as(:'afm');
select is(tests.error_code(format($$select public.save_provider_profile(%L, '{}')$$, :'a')), 'forbidden', 'a Fleet Manager can''t edit the provider profile');
reset role;
select tests.authenticate_as(:'vo', 'aal2');
select public.decide_provider_verification(:'a', true, null, true, true, :'apl');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = :'aowner' and kind = 'provider_verification' and link_path = 'verification'), 'the company Owner is told, with a link to the profile page');

-- Both post jobs; A never sees its own
select tests.authenticate_as(:'bowner');
select public.post_marketplace_job(:'b', jsonb_build_object('title', 'Engine overheating', 'description', 'Excavator overheats after an hour of work.',
  'category', 'diesel_mechanical', 'job_type', 'breakdown_repair', 'region_code', 'moreton_bay', 'suburb', 'Bray Park', 'asset_id', :'basset')) as bjob \gset
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = :'aowner' and kind = 'marketplace_job'), 'the verified company is alerted to matching jobs');
select tests.authenticate_as(:'aowner');
select public.post_marketplace_job(:'a', jsonb_build_object('title', 'Track tension', 'description', 'Tracks need tensioning on the excavator.',
  'category', 'diesel_mechanical', 'job_type', 'planned_service', 'region_code', 'moreton_bay', 'suburb', 'Albany Creek', 'asset_id', :'aasset')) as ajob \gset
select ok(not exists (select 1 from public.browse_marketplace_jobs(:'a') x where x ->> 'id' = :'ajob'), 'a company never sees its own job as a provider');
select is(tests.error_code(format($$select public.get_marketplace_job_for_provider(%L, %L)$$, :'a', :'ajob')), 'not_found', 'and can''t open it to quote');
reset role;

-- A's Fleet Manager quotes on B's job
select tests.authenticate_as(:'afm');
select ok(exists (select 1 from public.browse_marketplace_jobs(:'a') x where x ->> 'id' = :'bjob'), 'the Fleet Manager finds the other company''s job');
select public.submit_marketplace_proposal(:'a', :'bjob', '{"price_basis": "fixed", "amount_cents": 120000, "gst_applies": true, "available_from": "2026-12-03", "fee_consent": true}') as prop \gset
reset role;
select tests.authenticate_as(:'afin');
select is(tests.error_code(format($$select public.submit_marketplace_proposal(%L, %L, '{}')$$, :'a', :'bjob')), 'forbidden', 'Finance doesn''t quote');
reset role;

-- B accepts; A's technician does the work
select tests.authenticate_as(:'bowner');
select public.accept_marketplace_proposal(:'prop') as eng \gset
reset role;
select tests.authenticate_as(:'afm');
select lives_ok(format($$select public.assign_engagement_technician(%L, %L)$$, :'eng', :'atech'), 'A assigns its own technician');
reset role;
select tests.authenticate_as(:'atech');
select is((public.engagement_details(:'eng') ->> 'side'), 'provider', 'the technician works the engagement as the provider');
select lives_ok(format($$select public.update_engagement_attendance(%L, 'acknowledge_safety')$$, :'eng'), 'acknowledges site safety');
select lives_ok(format($$select public.update_engagement_attendance(%L, 'on_site')$$, :'eng'), 'and checks in on site');
reset role;
select tests.authenticate_as(:'bowner');
select is((public.engagement_details(:'eng') ->> 'side'), 'poster', 'the other company stays the customer');
reset role;

-- Proposals can state a price that includes GST
select tests.authenticate_as(:'bowner');
select public.post_marketplace_job(:'b', jsonb_build_object('title', 'Brake check', 'description', 'Brakes pulling to the left under load.',
  'category', 'diesel_mechanical', 'job_type', 'inspection', 'region_code', 'moreton_bay', 'suburb', 'Bray Park', 'asset_id', :'basset')) as bjob2 \gset
reset role;
select tests.authenticate_as(:'afm');
select public.submit_marketplace_proposal(:'a', :'bjob2', '{"price_basis": "fixed", "amount_cents": 55000, "gst_applies": true, "gst_inclusive": true, "available_from": "2026-12-04", "fee_consent": true}') as prop2 \gset
reset role;
select ok((select gst_applies and gst_inclusive from public.marketplace_proposal_versions where proposal_id = :'prop2'), 'a proposal records that its price includes GST');
select is(tests.error_code(format('insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, gst_applies, gst_inclusive, valid_until, fee_cents, fee_consented_at, created_by) values (%L, 9, ''fixed'', 1, false, true, now(), 1, now(), %L)', :'prop2', :'afm')), '23514',
  'GST can''t be included when no GST applies');

select * from finish();
rollback;
