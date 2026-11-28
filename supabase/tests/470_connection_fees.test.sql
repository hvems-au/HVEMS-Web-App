-- Billing slice 3: connection fees on acceptance (ADR-006) and monthly company waivers (SoW 5.5).
begin;
\ir _helpers.psql
select no_plan();

grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;

select tests.create_user('owner.cf@example.test', 'Cara Owner') as cowner \gset
select tests.create_user('p1.cf@example.test', 'Pete Provider') as p1owner \gset
select tests.create_user('p2.cf@example.test', 'Pam Provider') as p2owner \gset
select tests.create_user('vo.cf@example.test', 'Val Verifier') as vo \gset
insert into public.platform_staff (user_id, role, authorities) values (:'vo', 'support_agent', array['verification_officer']::public.platform_authority[]);

select tests.authenticate_as(:'cowner');
select public.create_organisation('company', 'Caboolture Civil') as co \gset
reset role;
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model)
values (:'co', 'EX-1', tests.class_id('excavator'), 'CAT', '320') returning id as asset \gset

select tests.authenticate_as(:'p1owner');
select public.create_organisation('provider', 'Morayfield Diesel', '51 824 753 556') as p1 \gset
select public.save_provider_profile(:'p1', '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"], "accepting_urgent": true, "contact_phone": "0400 111 222"}');
select public.add_provider_document(:'p1', 'public_liability', null, 'PL', :'p1' || '/pl.pdf', 'pl.pdf', null, null, current_date + 300) as p1pl \gset
select public.submit_provider_verification(:'p1');
reset role;
select tests.authenticate_as(:'p2owner');
select public.create_organisation('provider', 'Elimbah Hydraulics', '53 004 085 616') as p2 \gset
select public.save_provider_profile(:'p2', '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"]}');
select public.add_provider_document(:'p2', 'public_liability', null, 'PL', :'p2' || '/pl.pdf', 'pl.pdf', null, null, current_date + 300) as p2pl \gset
select public.submit_provider_verification(:'p2');
reset role;
select tests.authenticate_as(:'vo', 'aal2');
select public.decide_provider_verification(:'p1', true, null, true, true, :'p1pl');
select public.decide_provider_verification(:'p2', true, null, true, true, :'p2pl');
reset role;

select tests.authenticate_as(:'cowner');
select public.post_marketplace_job(:'co', jsonb_build_object('title', 'Track tension', 'description', 'Left track keeps slipping off.',
  'category', 'diesel_mechanical', 'job_type', 'breakdown_repair', 'region_code', 'moreton_bay', 'suburb', 'Caboolture',
  'address', '3 Quarry Road', 'asset_id', :'asset')) as job \gset
reset role;
select tests.authenticate_as(:'p1owner');
select public.submit_marketplace_proposal(:'p1', :'job', '{"price_basis": "fixed", "amount_cents": 90000, "gst_applies": true, "available_from": "2026-12-02", "fee_consent": true}') as prop1 \gset
reset role;
select tests.authenticate_as(:'p2owner');
select public.submit_marketplace_proposal(:'p2', :'job', '{"price_basis": "fixed", "amount_cents": 95000, "gst_applies": true, "available_from": "2026-12-02", "fee_consent": true}') as prop2 \gset
reset role;

-- Off until A-02.
select tests.authenticate_as(:'cowner');
select is(tests.error_code(format($$select public.begin_fee_acceptance(%L)$$, :'prop1')), 'fees_not_live', 'nothing is charged while connection fees are off');
reset role;
update public.platform_settings set value = 'true' where key = 'marketplace.connection_fees_live';

select tests.authenticate_as(:'cowner');
select is(tests.error_code(format($$select public.accept_marketplace_proposal(%L)$$, :'prop1')), 'fees_required', 'with fees on, acceptance goes through the fees');
select is(tests.error_code(format($$select public.begin_fee_acceptance(%L)$$, :'prop1')), 'card_required', 'the poster needs a card (no waiver yet)');
reset role;

-- Cards on file for the poster (the provider has none yet).
insert into public.billing_customers (organisation_id, stripe_customer_id, livemode) values (:'co', 'cus_Poster1', false);
insert into public.payment_methods (organisation_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
values (:'co', 'pm_Poster1', 'visa', '4242', 1, 2030, true);

-- Attempt A: the poster's card fails. Nothing charged, the job stays open.
select tests.authenticate_as(:'cowner');
select public.begin_fee_acceptance(:'prop1') as att_a \gset
select is(tests.error_code(format($$select public.begin_fee_acceptance(%L)$$, :'prop2')), 'acceptance_pending', 'one acceptance per job at a time');
select is(tests.error_code(format($$select public.record_fee_authorisation(%L, 'poster', null, false, 'x')$$, :'att_a')), '42501', 'only the server records payment outcomes');
reset role;
select pg_temp.as_service();
select is(public.record_fee_authorisation(:'att_a', 'poster', 'pi_A1', false, 'Your card was declined.'), 'failed_poster', 'a declined poster card fails the attempt');
reset role;
select is((select status from public.marketplace_jobs where id = :'job'), 'open', 'the job is still open');
select is((select count(*)::int from public.marketplace_engagements where job_id = :'job'), 0, 'no engagement');

-- Attempt B: poster held, provider declined -> pending fees; the poster cancels; the hold is released.
select tests.authenticate_as(:'cowner');
select public.begin_fee_acceptance(:'prop1') as att_b \gset
reset role;
select pg_temp.as_service();
select is(public.record_fee_authorisation(:'att_b', 'poster', 'pi_B1', true), 'authorising', 'the poster''s fee is held');
select is(public.record_fee_authorisation(:'att_b', 'provider', null, false, 'No card on file. Add a card under Billing.'), 'pending_provider', 'a declined provider card waits for the provider');
reset role;
select ok((select pending_until between now() + interval '239 minutes' and now() + interval '241 minutes' from public.connection_fee_attempts where id = :'att_b'),
  'standard jobs give the provider 4 hours');
select ok(exists (select 1 from public.notifications where organisation_id = :'p1' and recipient_id = :'p1owner' and kind = 'billing_payment_failed'),
  'the provider is told to pay (always emailed)');
select ok(exists (select 1 from public.notifications where organisation_id = :'co' and kind = 'marketplace_engagement' and title like 'Acceptance pending fees%'),
  'the poster is told the acceptance is pending fees');
select is(tests.error_code(format($$update public.marketplace_jobs set status = 'cancelled' where id = %L$$, :'job')), 'acceptance_pending',
  'the job can''t be closed while fees are pending');
update public.marketplace_jobs set closes_at = now() - interval '1 minute' where id = :'job';
select app.expire_marketplace();
select is((select status from public.marketplace_jobs where id = :'job'), 'open', 'expiry leaves a job with pending fees alone');
update public.marketplace_jobs set closes_at = now() + interval '3 days' where id = :'job';
select tests.authenticate_as(:'p2owner');
select is((select count(*)::int from public.connection_fee_attempts), 0, 'other providers don''t see the attempt');
reset role;
select tests.authenticate_as(:'cowner');
select public.cancel_fee_acceptance(:'att_b');
reset role;
select is((select state || '|' || needs_stripe_cleanup from public.connection_fee_attempts where id = :'att_b'), 'cancelled|true', 'cancelled; the poster''s hold is to be released');
select pg_temp.as_service();
select is((select count(*)::int from public.claim_fee_cleanups(10) where id = :'att_b'), 1, 'the server picks it up');
select public.finish_fee_cleanup(:'att_b', 'released', null);
reset role;
select is((select poster_status || '|' || needs_stripe_cleanup from public.connection_fee_attempts where id = :'att_b'), 'released|false', 'and records the release');

-- Attempt C: provider declined, updates its card within the window and pays; both captured -> engagement.
select tests.authenticate_as(:'cowner');
select public.begin_fee_acceptance(:'prop1') as att_c \gset
reset role;
select pg_temp.as_service();
select public.record_fee_authorisation(:'att_c', 'poster', 'pi_C1', true);
select public.record_fee_authorisation(:'att_c', 'provider', null, false, 'Your card was declined.');
reset role;
select tests.authenticate_as(:'p1owner');
select is(tests.error_code(format($$select public.retry_provider_fee(%L)$$, :'att_c')), 'card_required', 'the provider needs a card to pay');
reset role;
insert into public.billing_customers (organisation_id, stripe_customer_id, livemode) values (:'p1', 'cus_Prov1', false);
insert into public.payment_methods (organisation_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
values (:'p1', 'pm_Prov1', 'visa', '4242', 1, 2030, true);
select tests.authenticate_as(:'p2owner');
select is(tests.error_code(format($$select public.retry_provider_fee(%L)$$, :'att_c')), 'forbidden', 'another provider can''t pay it');
reset role;
select tests.authenticate_as(:'p1owner');
select is(public.retry_provider_fee(:'att_c'), 1, 'the provider tries again');
reset role;
select pg_temp.as_service();
select public.record_fee_authorisation(:'att_c', 'provider', 'pi_C2', true);
select ok(public.begin_fee_capture(:'att_c'), 'both held: capture goes ahead');
select public.complete_fee_acceptance(:'att_c') as eng \gset
select is(public.complete_fee_acceptance(:'att_c'), :'eng'::uuid, 'completing twice returns the same engagement');
reset role;
select is((select fee_status || '|' || poster_fee_cents || '|' || provider_fee_cents from public.marketplace_engagements where id = :'eng'), 'collected|2900|2900',
  'both fees collected on the engagement');
select is((select state from public.connection_fee_attempts where id = :'att_c'), 'confirmed', 'the attempt is confirmed');
select is((select status from public.marketplace_jobs where id = :'job'), 'engaged', 'the job is engaged');
select is((select status from public.marketplace_proposals where id = :'prop2'), 'not_selected', 'the other proposal is not selected');
select is((select count(*)::int from public.marketplace_engagements where job_id = :'job'), 1, 'exactly one engagement');

-- Waivers: one per N qualifying assets (N lowered to 1 here); an asset qualifies after 14 days.
update public.platform_settings set value = '1' where key = 'waivers.assets_per_waiver';
select tests.authenticate_as(:'cowner');
select is((select allowance from public.company_waiver_balance(:'co')), 0, 'a new asset doesn''t count yet');
reset role;
update public.assets set created_at = now() - interval '20 days' where id = :'asset';
select tests.authenticate_as(:'cowner');
select is((select available || '/' || allowance from public.company_waiver_balance(:'co')), '1/1', 'after 14 days it earns a waiver');
select public.post_marketplace_job(:'co', jsonb_build_object('title', 'Bucket teeth', 'description', 'Replace worn teeth.',
  'category', 'diesel_mechanical', 'job_type', 'planned_service', 'region_code', 'moreton_bay', 'suburb', 'Caboolture', 'address', '3 Quarry Road', 'asset_id', :'asset')) as job2 \gset
reset role;
select tests.authenticate_as(:'p1owner');
select public.submit_marketplace_proposal(:'p1', :'job2', '{"price_basis": "fixed", "amount_cents": 40000, "gst_applies": true, "available_from": "2026-12-03", "fee_consent": true}') as prop3 \gset
reset role;
select tests.authenticate_as(:'cowner');
select public.begin_fee_acceptance(:'prop3') as att_d \gset
reset role;
select is((select poster_status from public.connection_fee_attempts where id = :'att_d'), 'waived', 'the waiver covers the poster''s fee');
select is((select status from public.company_waivers where attempt_id = :'att_d'), 'reserved', 'and is reserved, so it can''t be used twice');
-- The window lapses: nothing charged, the waiver comes back.
select pg_temp.as_service();
select public.record_fee_authorisation(:'att_d', 'provider', null, false, 'Declined');
reset role;
update public.connection_fee_attempts set pending_until = now() - interval '1 minute' where id = :'att_d';
select is(app.sweep_fee_attempts(), 1, 'the lapsed window is swept');
select is((select state || '|' || needs_stripe_cleanup from public.connection_fee_attempts where id = :'att_d'), 'expired|false', 'expired; nothing held to release');
select tests.authenticate_as(:'cowner');
select is((select available from public.company_waiver_balance(:'co')), 1, 'the waiver is available again');
reset role;
select ok(exists (select 1 from public.notifications where organisation_id = :'p1' and title like 'Acceptance lapsed%'), 'the provider is told it lapsed');

-- Using the waiver: confirmed with no poster charge; the waiver is used.
select tests.authenticate_as(:'cowner');
select public.begin_fee_acceptance(:'prop3') as att_e \gset
reset role;
select pg_temp.as_service();
select public.record_fee_authorisation(:'att_e', 'provider', 'pi_E2', true);
select ok(public.begin_fee_capture(:'att_e'), 'capture goes ahead with a waived poster fee');
select public.complete_fee_acceptance(:'att_e') as eng2 \gset
reset role;
select is((select poster_fee_cents || '|' || provider_fee_cents from public.marketplace_engagements where id = :'eng2'), '0|2900', 'the poster pays nothing; the provider pays');
select is((select status from public.company_waivers where attempt_id = :'att_e'), 'used', 'the waiver is used');
select tests.authenticate_as(:'cowner');
select is((select available || '/' || used from public.company_waiver_balance(:'co')), '0/1', 'none left this month');
reset role;

select * from finish();
rollback;
