-- 2D Marketplace part 2: jobs, visibility, questions and proposals (MKT-04..09, MKT-20..22).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.mj@example.test', 'Owen Owner') as cowner \gset
select tests.create_user('fm.mj@example.test', 'Fiona Fleet') as fm \gset
select tests.create_user('buyer.mj@example.test', 'Bea Buyer') as buyer \gset
select tests.create_user('prov1.mj@example.test', 'Pete Provider') as p1owner \gset
select tests.create_user('prov2.mj@example.test', 'Quinn Provider') as p2owner \gset
select tests.create_user('vo.mj@example.test', 'Val Verifier') as vo \gset
insert into public.platform_staff (user_id, role, authorities) values (:'vo', 'support_agent', array['verification_officer']::public.platform_authority[]);

select tests.authenticate_as(:'cowner');
select public.create_organisation('company', 'Caboolture Haulage') as co \gset
reset role;
select tests.add_member(:'co', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'co', :'buyer', 'finance') as buyer_m \gset
insert into public.membership_grants (organisation_id, membership_id, grant_type) values (:'co', :'buyer_m', 'marketplace_buyer');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, registration_number, registration_state, vin)
values (:'co', 'TR-9', tests.class_id('excavator'), 'Komatsu', 'PC200', 'ABC123', 'QLD', 'VINSECRET') returning id as asset \gset

-- Two verified providers: one covering Moreton Bay diesel work, one elsewhere.
select tests.authenticate_as(:'p1owner');
select public.create_organisation('provider', 'North Diesel', '51 824 753 556') as p1 \gset
select public.save_provider_profile(:'p1', '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"], "accepting_urgent": true}');
select public.add_provider_document(:'p1', 'public_liability', null, 'PL', :'p1' || '/pl.pdf', 'pl.pdf', null, null, current_date + 300) as p1pl \gset
select public.submit_provider_verification(:'p1');
reset role;
select tests.authenticate_as(:'p2owner');
select public.create_organisation('provider', 'Gold Tyres', '51 824 753 556') as p2 \gset
select public.save_provider_profile(:'p2', '{"categories": ["tyres"], "region_codes": ["brisbane"]}');
select public.add_provider_document(:'p2', 'public_liability', null, 'PL', :'p2' || '/pl.pdf', 'pl.pdf', null, null, current_date + 300) as p2pl \gset
select public.submit_provider_verification(:'p2');
reset role;
select tests.authenticate_as(:'vo', 'aal2');
select public.decide_provider_verification(:'p1', true, null, true, true, :'p1pl');
select public.decide_provider_verification(:'p2', true, null, true, true, :'p2pl');
reset role;

-- MKT-04: who can post
select tests.authenticate_as(:'fm');
select is(tests.error_code(format($$select public.post_marketplace_job(%L, '{}')$$, :'co')), 'forbidden', 'a Fleet Manager without the Marketplace Buyer grant cannot post');
reset role;
select tests.authenticate_as(:'buyer');
select is(tests.error_code(format($$select public.post_marketplace_job(%L, %L)$$, :'co',
  jsonb_build_object('title', 'Hydraulic leak', 'description', 'Main boom cylinder leaking badly', 'category', 'hydraulics', 'job_type', 'breakdown_repair',
    'region_code', 'noosa', 'suburb', 'Noosaville', 'asset_id', :'asset'))), 'region_not_open', 'posting outside open regions is refused');
select public.post_marketplace_job(:'co', jsonb_build_object(
  'title', 'Engine won''t start', 'description', 'Excavator cranks but will not fire. On site at quarry.', 'category', 'diesel_mechanical',
  'job_type', 'breakdown_repair', 'region_code', 'moreton_bay', 'suburb', 'Caboolture', 'postcode', '4510',
  'address', '12 Secret Quarry Rd', 'site_access_notes', 'Gate code 4455; hi-vis and steel caps', 'asset_id', :'asset',
  'share', jsonb_build_array('make', 'model'), 'budget_min_cents', 50000, 'budget_max_cents', 150000)) as job \gset
reset role;
select ok((select work_order_id is not null from public.marketplace_jobs where id = :'job'), 'a company job is always linked to a work order');
select is((select kind from public.work_orders w join public.marketplace_jobs j on j.work_order_id = w.id where j.id = :'job'), 'marketplace', 'one is created when none was chosen');
select ok(exists (select 1 from public.notifications where recipient_id = :'p1owner' and kind = 'marketplace_job'), 'the matching provider is alerted');
select ok(not exists (select 1 from public.notifications where recipient_id = :'p2owner' and kind = 'marketplace_job'), 'a provider outside the category and area is not alerted');

-- MKT-04/06: providers see only the public fields
select tests.authenticate_as(:'p2owner');
select is((select count(*) from public.marketplace_jobs)::int, 0, 'providers cannot read jobs directly');
select ok(exists (select 1 from public.browse_marketplace_jobs(:'p2') b where b ->> 'id' = :'job'), 'but any verified provider finds it by search');
select public.get_marketplace_job_for_provider(:'p2', :'job') as pub \gset
select ok(:'pub'::jsonb ->> 'address' is null and :'pub'::jsonb ->> 'site_access_notes' is null, 'the address and site notes stay private');
select is(:'pub'::jsonb -> 'shared_asset', '{"make": "Komatsu", "model": "PC200"}'::jsonb, 'only the shared equipment fields are shown');
select is(:'pub'::jsonb ->> 'poster', 'Fleet company', 'the poster is hidden by default');
reset role;
select tests.authenticate_as(:'buyer');
select is(public.preview_marketplace_job(:'job'), :'pub'::jsonb - 'saved' - 'invited' - 'block', 'the poster''s preview equals the provider view');
reset role;

-- MKT-08: questions are private; contacts are masked and flagged
select tests.authenticate_as(:'p1owner');
select public.send_marketplace_message(:'job', :'p1', 'Is it a 6D102? Call me on 0412 345 678 or email pete@northdiesel.com.au') as msg \gset
select ok((select body from public.marketplace_messages where id = :'msg') like '%[phone hidden]%[email hidden]%', 'phone numbers and emails are masked');
select is((select count(*) from public.marketplace_message_flags)::int, 0, 'parties cannot read the unmasked text');
reset role;
select ok(exists (select 1 from public.marketplace_message_flags where message_id = :'msg' and original_body like '%0412 345 678%'), 'the original is kept for HVEMS moderation');
select tests.authenticate_as(:'p2owner');
select is((select count(*) from public.marketplace_messages where job_id = :'job')::int, 0, 'another provider cannot see the question');
reset role;
select tests.authenticate_as(:'buyer');
select lives_ok(format($$select public.send_marketplace_message(%L, %L, 'Yes, 6D102.')$$, :'job', :'p1'), 'the poster replies privately');
select is(tests.error_code(format($$select public.send_marketplace_message(%L, %L, 'Hello')$$, :'job', :'p2')), 'not_found', 'the poster can''t start a thread with a provider who hasn''t asked or proposed');
reset role;

-- MKT-09: proposals
select tests.authenticate_as(:'p1owner');
select is(tests.error_code(format($$select public.submit_marketplace_proposal(%L, %L, '{"price_basis": "fixed", "amount_cents": 90000, "gst_applies": true, "available_from": "2026-12-01"}')$$, :'p1', :'job')),
  'fee_consent_required', 'the provider must agree to the connection fee');
select is(tests.error_code(format($$select public.submit_marketplace_proposal(%L, %L, '{"price_basis": "fixed", "amount_cents": 90000, "gst_applies": true, "fee_consent": true}')$$, :'p1', :'job')),
  'availability_required', 'a standard proposal gives an availability window');
select public.submit_marketplace_proposal(:'p1', :'job', '{"price_basis": "fixed", "amount_cents": 90000, "gst_applies": true, "available_from": "2026-12-01", "available_to": "2026-12-03", "fee_consent": true}') as prop \gset
select is((select fee_cents from public.marketplace_proposal_versions where proposal_id = :'prop'), 2900::bigint, 'the standard connection fee is recorded with the consent');
select is((select valid_until::date - now()::date from public.marketplace_proposals where id = :'prop'), 3, 'valid for 72 hours by default');
select public.submit_marketplace_proposal(:'p1', :'job', '{"price_basis": "estimate", "amount_cents": 80000, "amount_max_cents": 120000, "gst_applies": true, "available_from": "2026-12-01", "fee_consent": true}') as prop2 \gset
select is(:'prop2', :'prop', 'one proposal per provider per job');
select is((select count(*) from public.marketplace_proposal_versions where proposal_id = :'prop')::int, 2, 'every revision is kept');
select is(tests.error_code(format($$update public.marketplace_proposal_versions set amount_cents = 1 where proposal_id = %L$$, :'prop')), 'append_only', 'versions are never edited');
reset role;

select tests.authenticate_as(:'buyer');
select is((select count(*) from public.list_job_proposals(:'job'))::int, 1, 'the poster sees the proposal');
select is((select (x -> 'terms' ->> 'amount_max_cents')::bigint from public.list_job_proposals(:'job') x), 120000::bigint, 'with the latest version');
select is((select (x ->> 'conflict')::boolean from public.list_job_proposals(:'job') x), false, 'no conflict of interest');
select lives_ok(format($$select public.send_marketplace_clarification(%L, 'The machine is on a 10 degree slope.')$$, :'job'), 'one clarification to everyone who asked or proposed');
select is(tests.error_code(format($$select public.send_marketplace_clarification(%L, 'Again')$$, :'job')), 'already_sent', 'only one');
reset role;

-- MKT-20: conflict of interest when a member is in both organisations
select tests.add_member(:'p1', :'fm', 'provider_manager');
select tests.authenticate_as(:'buyer');
select is((select (x ->> 'conflict')::boolean from public.list_job_proposals(:'job') x), true, 'a shared member raises the conflict flag');
reset role;

-- MKT-21: invited-only jobs are absent from search for others
select tests.authenticate_as(:'buyer');
select public.post_marketplace_job(:'co', jsonb_build_object(
  'title', 'Tyre change', 'description', 'Two rear tyres to replace on the excavator', 'category', 'tyres', 'job_type', 'planned_service',
  'region_code', 'moreton_bay', 'suburb', 'Morayfield', 'asset_id', :'asset', 'invited_only', true, 'invite', jsonb_build_array(:'p2'))) as job2 \gset
reset role;
select tests.authenticate_as(:'p1owner');
select ok(not exists (select 1 from public.browse_marketplace_jobs(:'p1') b where b ->> 'id' = :'job2'), 'an invited-only job is hidden from others');
reset role;
select tests.authenticate_as(:'p2owner');
select ok(exists (select 1 from public.browse_marketplace_jobs(:'p2') b where b ->> 'id' = :'job2'), 'and visible to the invited provider');
reset role;

-- Expiry, extension and withdrawal (MKT-06, MKT-22)
update public.marketplace_jobs set closes_at = now() - interval '1 minute' where id = :'job2';
select app.expire_marketplace();
select is((select status from public.marketplace_jobs where id = :'job2'), 'expired', 'jobs expire at their closing time');
select tests.authenticate_as(:'buyer');
select lives_ok(format($$select public.extend_marketplace_job(%L)$$, :'job2'), 'a standard job can be extended');
select is(tests.error_code(format($$select public.extend_marketplace_job(%L)$$, :'job2')), 'already_extended', 'once');
select lives_ok(format($$select public.withdraw_marketplace_job(%L, 'Done in-house')$$, :'job'), 'withdrawing a job costs nothing');
reset role;
select is((select status from public.marketplace_proposals where id = :'prop'), 'not_selected', 'its proposals are not selected');

-- Expired insurance blocks proposals (MKT-03)
update public.provider_badges set expires_on = current_date - 1 where organisation_id = :'p2' and kind = 'public_liability';
select tests.authenticate_as(:'p2owner');
select is(tests.error_code(format($$select public.submit_marketplace_proposal(%L, %L, '{"price_basis": "fixed", "amount_cents": 1000, "gst_applies": false, "available_from": "2026-12-01", "fee_consent": true}')$$, :'p2', :'job2')),
  'not_eligible', 'a provider whose insurance expired cannot propose');
reset role;

select * from finish();
rollback;
