-- 2D Marketplace part 3: acceptance, engagements, findings, completion, reviews, cancellations, no-shows, cases.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.me@example.test', 'Olga Owner') as cowner \gset
select tests.create_user('p1.me@example.test', 'Paul Provider') as p1owner \gset
select tests.create_user('p1tech.me@example.test', 'Terry Tech') as p1tech \gset
select tests.create_user('p2.me@example.test', 'Pia Provider') as p2owner \gset
select tests.create_user('vo.me@example.test', 'Vic Verifier') as vo \gset
select tests.create_user('agent.me@example.test', 'Sam Support') as agent \gset
insert into public.platform_staff (user_id, role, authorities) values
  (:'vo', 'support_agent', array['verification_officer']::public.platform_authority[]), (:'agent', 'support_agent', '{}');

select tests.authenticate_as(:'cowner');
select public.create_organisation('company', 'Burpengary Plant') as co \gset
reset role;
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model)
values (:'co', 'EX-7', tests.class_id('excavator'), 'CAT', '320') returning id as asset \gset

-- Two verified providers
select tests.authenticate_as(:'p1owner');
select public.create_organisation('provider', 'Deception Bay Diesel', '51 824 753 556') as p1 \gset
select public.save_provider_profile(:'p1', '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"], "accepting_urgent": true, "contact_phone": "0400 111 222"}');
select public.add_provider_document(:'p1', 'public_liability', null, 'PL', :'p1' || '/pl.pdf', 'pl.pdf', null, null, current_date + 300) as p1pl \gset
select public.submit_provider_verification(:'p1');
reset role;
select tests.add_member(:'p1', :'p1tech', 'provider_technician') as p1tech_m \gset
select tests.authenticate_as(:'p2owner');
select public.create_organisation('provider', 'Narangba Mechanical', '51 824 753 556') as p2 \gset
select public.save_provider_profile(:'p2', '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"]}');
select public.add_provider_document(:'p2', 'public_liability', null, 'PL', :'p2' || '/pl.pdf', 'pl.pdf', null, null, current_date + 300) as p2pl \gset
select public.submit_provider_verification(:'p2');
reset role;
select tests.authenticate_as(:'vo', 'aal2');
select public.decide_provider_verification(:'p1', true, null, true, true, :'p1pl');
select public.decide_provider_verification(:'p2', true, null, true, true, :'p2pl');
reset role;

-- A job with private details, and two proposals
select tests.authenticate_as(:'cowner');
select public.post_marketplace_job(:'co', jsonb_build_object('title', 'Hydraulic pump failure', 'description', 'Main pump whining and losing pressure.',
  'category', 'diesel_mechanical', 'job_type', 'breakdown_repair', 'region_code', 'moreton_bay', 'suburb', 'Burpengary',
  'address', '7 Hidden Lane', 'site_access_notes', 'Call the site office first', 'asset_id', :'asset')) as job \gset
reset role;
select tests.authenticate_as(:'p1owner');
select public.submit_marketplace_proposal(:'p1', :'job', '{"price_basis": "fixed", "amount_cents": 180000, "gst_applies": true, "available_from": "2026-12-02", "fee_consent": true}') as prop1 \gset
reset role;
select tests.authenticate_as(:'p2owner');
select public.submit_marketplace_proposal(:'p2', :'job', '{"price_basis": "fixed", "amount_cents": 200000, "gst_applies": true, "available_from": "2026-12-02", "fee_consent": true}') as prop2 \gset
select is(tests.error_code(format($$select public.accept_marketplace_proposal(%L)$$, :'prop2')), 'forbidden', 'a provider cannot accept a proposal');
reset role;

-- MKT-10: acceptance
select tests.authenticate_as(:'cowner');
select public.accept_marketplace_proposal(:'prop1') as eng \gset
select is(tests.error_code(format($$select public.accept_marketplace_proposal(%L)$$, :'prop2')), 'already_engaged', 'a second acceptance creates no second engagement');
reset role;
select is((select count(*) from public.marketplace_engagements where job_id = :'job')::int, 1, 'one engagement per job');
select is((select status from public.marketplace_jobs where id = :'job'), 'engaged', 'the job is engaged');
select is((select status from public.marketplace_proposals where id = :'prop2'), 'not_selected', 'other proposals are not selected');
select is((select fee_status from public.marketplace_engagements where id = :'eng'), 'not_live', 'fees are recorded but not charged until billing is live');
select is((select poster_fee_cents from public.marketplace_engagements where id = :'eng'), 2900::bigint, 'the standard fee is recorded for each party');
select ok((select w.vendor_name = 'Deception Bay Diesel' and w.status = 'in_progress' from public.work_orders w join public.marketplace_jobs j on j.work_order_id = w.id where j.id = :'job'),
  'the work order shows the provider');

-- MKT-11: details released to the engaged provider only
select tests.authenticate_as(:'p1owner');
select is((public.engagement_details(:'eng') -> 'job' ->> 'address'), '7 Hidden Lane', 'the engaged provider sees the address');
select is(tests.error_code(format($$select public.update_engagement_attendance(%L, 'on_site')$$, :'eng')), 'safety_ack_required', 'site safety must be acknowledged before On site');
reset role;
select tests.authenticate_as(:'p2owner');
select is(tests.error_code(format($$select public.engagement_details(%L)$$, :'eng')), 'not_found', 'a provider who wasn''t selected never sees private details');
reset role;

-- Messages are no longer masked between engaged parties
select tests.authenticate_as(:'p1owner');
select public.send_marketplace_message(:'job', :'p1', 'Call me on 0412 345 678') as m1 \gset
select is((select masked from public.marketplace_messages where id = :'m1'), false, 'after confirmation, contact details are not masked');
reset role;

-- MKT-12 no-show: refused before the threshold
update public.marketplace_engagements set scheduled_start = now() + interval '1 hour' where id = :'eng';
select tests.authenticate_as(:'cowner');
select is(tests.error_code(format($$select public.report_no_show(%L)$$, :'eng')), 'too_early', 'a no-show before the threshold is refused');
reset role;

-- MKT-12/13: attendance, technician, findings
select tests.authenticate_as(:'p1owner');
select lives_ok(format($$select public.assign_engagement_technician(%L, %L)$$, :'eng', :'p1tech'), 'the provider assigns its technician');
reset role;
select tests.authenticate_as(:'p1tech');
select lives_ok(format($$select public.update_engagement_attendance(%L, 'acknowledge_safety')$$, :'eng'), 'the technician acknowledges site safety');
select lives_ok(format($$select public.update_engagement_attendance(%L, 'on_site')$$, :'eng'), 'and checks in on site');
select public.record_engagement_finding(:'eng', 'critical', 'Cracked boom pin', 'Pin cracked through') as crit \gset
select public.record_engagement_finding(:'eng', 'minor', 'Worn bucket teeth') as minor \gset
reset role;
select is((select condition from public.assets where id = :'asset')::text, 'out_of_service', 'a Critical provider finding makes the equipment Broken/Out of service at once');
select ok((select defect_id is not null and status = 'confirmed' from public.engagement_findings where id = :'crit'), 'and opens a defect');
select is((select status from public.engagement_findings where id = :'minor'), 'suggested', 'a Minor finding waits for the company to confirm');
select tests.authenticate_as(:'cowner');
select lives_ok(format($$select public.decide_engagement_finding(%L, true)$$, :'minor'), 'the company confirms it');
reset role;
select ok((select defect_id is not null from public.engagement_findings where id = :'minor'), 'which becomes a defect');

-- MKT-14 variations
select tests.authenticate_as(:'p1owner');
select public.propose_engagement_variation(:'eng', 'price', 'Seal kit also needed', 210000) as var \gset
select is(tests.error_code(format($$select public.decide_engagement_variation(%L, true)$$, :'var')), 'forbidden', 'the proposer cannot accept its own change');
reset role;
select tests.authenticate_as(:'cowner');
select lives_ok(format($$select public.decide_engagement_variation(%L, true)$$, :'var'), 'the customer accepts the change');
reset role;
select is((select poster_fee_cents from public.marketplace_engagements where id = :'eng'), 2900::bigint, 'variations don''t change connection fees');

-- MKT-15 completion
select tests.authenticate_as(:'p1tech');
select lives_ok(format($$select public.submit_engagement_completion(%L, 'complete', 'Replaced the pump and seal kit')$$, :'eng'), 'the provider submits the completion report');
reset role;
select tests.authenticate_as(:'cowner');
select is(tests.error_code(format($$select public.confirm_engagement_completion(%L, false, '')$$, :'eng')), 'reason_required', 'a correction needs a reason');
select lives_ok(format($$select public.confirm_engagement_completion(%L, true)$$, :'eng'), 'the customer confirms completion');
reset role;
select is((select condition from public.assets where id = :'asset')::text, 'out_of_service', 'confirming completion never clears the defect or returns the equipment to service');
select is((select w.status from public.work_orders w join public.marketplace_jobs j on j.work_order_id = w.id where j.id = :'job'), 'completed', 'the work order is completed for review');

-- MKT-17 reviews
select tests.authenticate_as(:'cowner');
select lives_ok(format($$select public.review_engagement(%L, 5, 'Quick and tidy')$$, :'eng'), 'the customer reviews the provider');
select is(tests.error_code(format($$select public.review_engagement(%L, 4)$$, :'eng')), 'already_reviewed', 'once per engagement');
reset role;
select tests.authenticate_as(:'p1owner');
select lives_ok(format($$select public.reply_to_review(%L, 'Thanks!')$$, :'eng'), 'the provider replies');
select is(tests.error_code(format($$select public.reply_to_review(%L, 'Again')$$, :'eng')), 'already_replied', 'once');
reset role;
select is((app.provider_reliability(:'p1') ->> 'rating'), null, 'the average shows only after three reviews');
select tests.authenticate_as(:'agent', 'aal2');
select lives_ok(format($$select public.remove_review(%L, 'Contains personal details')$$, :'eng'), 'HVEMS removes a review with a reason');
reset role;
select ok(exists (select 1 from public.engagement_reviews where engagement_id = :'eng' and removed_at is not null), 'and keeps it for audit');

-- MKT-16/24: provider cancellations are strikes; three in 90 days open a review case; the job reopens
select tests.authenticate_as(:'cowner');
select public.post_marketplace_job(:'co', jsonb_build_object('title', 'Service the loader', 'description', 'Annual service due on the loader.',
  'category', 'diesel_mechanical', 'job_type', 'planned_service', 'region_code', 'moreton_bay', 'suburb', 'Burpengary', 'asset_id', :'asset')) as job2 \gset
reset role;
select tests.authenticate_as(:'p1owner');
select public.submit_marketplace_proposal(:'p1', :'job2', '{"price_basis": "fixed", "amount_cents": 50000, "gst_applies": true, "available_from": "2026-12-05", "fee_consent": true}') as j2p1 \gset
reset role;
select tests.authenticate_as(:'p2owner');
select public.submit_marketplace_proposal(:'p2', :'job2', '{"price_basis": "fixed", "amount_cents": 55000, "gst_applies": true, "available_from": "2026-12-05", "fee_consent": true}') as j2p2 \gset
reset role;
select tests.authenticate_as(:'cowner');
select public.accept_marketplace_proposal(:'j2p1') as eng2 \gset
reset role;
select tests.authenticate_as(:'p1tech');
select is(tests.error_code(format($$select public.cancel_marketplace_engagement(%L, 'cannot_attend', 'Sick')$$, :'eng2')), 'forbidden', 'technicians don''t cancel engagements');
reset role;
select tests.authenticate_as(:'p1owner');
select lives_ok(format($$select public.cancel_marketplace_engagement(%L, 'cannot_attend', 'Staff sick')$$, :'eng2'), 'the provider cancels with a reason');
reset role;
select is((select count(*) from public.provider_strikes where provider_id = :'p1')::int, 1, 'a provider cancellation is a strike');
select is((select status from public.marketplace_jobs where id = :'job2'), 'open', 'the job reopens');
select is((select status from public.marketplace_proposals where id = :'j2p2'), 'active', 'and the remaining valid proposal can be accepted');
insert into public.provider_strikes (provider_id, reason) values (:'p1', 'no_show');
select app.add_strike(:'p1', null, 'provider_cancellation');
select ok(exists (select 1 from public.marketplace_cases where provider_id = :'p1' and category = 'strike_review'), 'the third strike opens a review case');

-- No-show: case with 48 hours to respond, then HVEMS decides
select tests.authenticate_as(:'cowner');
select public.accept_marketplace_proposal(:'j2p2') as eng3 \gset
reset role;
update public.marketplace_engagements set scheduled_start = now() - interval '3 hours' where id = :'eng3';
select tests.authenticate_as(:'cowner');
select public.report_no_show(:'eng3', 'Nobody came') as ns \gset
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select is(tests.error_code(format($$select public.decide_marketplace_case(%L, true, 'Upheld')$$, :'ns')), 'awaiting_response', 'HVEMS waits for the provider''s 48 hours');
reset role;
select tests.authenticate_as(:'p2owner');
select lives_ok(format($$select public.respond_marketplace_case(%L, 'Truck broke down on the way')$$, :'ns'), 'the provider responds');
reset role;
select tests.authenticate_as(:'cowner');
select is(tests.error_code(format($$select public.decide_marketplace_case(%L, true, 'x')$$, :'ns')), 'forbidden', 'only HVEMS decides');
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select lives_ok(format($$select public.decide_marketplace_case(%L, true, 'No contact made with the customer')$$, :'ns'), 'HVEMS upholds the no-show');
reset role;
select is((select status from public.marketplace_engagements where id = :'eng3'), 'cancelled', 'the engagement ends');
select ok(exists (select 1 from public.provider_strikes where provider_id = :'p2' and reason = 'no_show'), 'an upheld no-show is a strike');
select is((select status from public.marketplace_jobs where id = :'job2'), 'open', 'and the job reopens');

select * from finish();
rollback;
