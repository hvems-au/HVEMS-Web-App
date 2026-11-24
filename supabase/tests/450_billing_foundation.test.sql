-- Billing slice 1: Stripe customers, saved cards written by the server only, webhook log.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.b@example.test', 'Bea Owner') as owner \gset
select tests.create_user('fm.b@example.test', 'Ben Fleet') as fm \gset
select tests.create_user('other.b@example.test', 'Olly Other') as other \gset
select tests.authenticate_as(:'owner', 'aal2');
select public.create_organisation('company', 'Bravo Haulage') as org \gset
reset role;
select tests.authenticate_as(:'other', 'aal2');
select public.create_organisation('company', 'Other Co') as org2 \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;

-- The gate: billing managers only.
select tests.authenticate_as(:'owner', 'aal2');
select is((public.billing_gate(:'org') ->> 'name'), 'Bravo Haulage', 'the Owner passes the billing check');
select is((public.billing_gate(:'org') ->> 'stripe_customer_id'), null, 'with no Stripe customer yet');
reset role;
select tests.authenticate_as(:'fm', 'aal2');
select is(tests.error_code(format('select public.billing_gate(%L)', :'org')), 'forbidden', 'a Fleet Manager cannot manage billing');
reset role;
select tests.authenticate_as(:'other', 'aal2');
select is(tests.error_code(format('select public.billing_gate(%L)', :'org')), 'forbidden', 'nor can another organisation');

-- Members can't write customers or cards themselves.
select is(tests.error_code(format($$select public.record_billing_customer(%L, 'cus_Fake1', false, null)$$, :'org2')), '42501',
  'members cannot record a Stripe customer');
select is(tests.error_code(format($$select public.record_payment_method(%L, 'pm_Fake1', 'visa', '4242', 12, 2030, true, null)$$, :'org2')), '42501',
  'members cannot record a card');
select is(tests.error_code(format($$insert into public.payment_methods (organisation_id, stripe_payment_method_id) values (%L, 'pm_Fake2')$$, :'org2')), '42501',
  'or insert card rows directly');
reset role;

-- The server records them.
select pg_temp.as_service();
select public.record_billing_customer(:'org', 'cus_Bravo1', false, :'owner');
select public.record_billing_customer(:'org', 'cus_Bravo2', false, :'owner');
select is(tests.error_code(format($$select public.record_payment_method(%L, 'pm_X', 'visa', '4242', 12, 2030, true, null)$$, :'org2')), 'no_billing_customer',
  'a card needs the organisation''s Stripe customer first');
select public.record_payment_method(:'org', 'pm_Visa1', 'Visa', '4242', 12, 2030, false, :'owner');
select public.record_payment_method(:'org', 'pm_Mc1', 'mastercard', '4444', 1, 2031, true, :'owner');
reset role;
select is((select stripe_customer_id from public.billing_customers where organisation_id = :'org'), 'cus_Bravo1', 'the first customer is kept');
select is((select string_agg(stripe_payment_method_id || ':' || is_default, ',' order by stripe_payment_method_id) from public.payment_methods where organisation_id = :'org'),
  'pm_Mc1:true,pm_Visa1:false', 'the newest card made default replaces the old default');
select is((select brand from public.payment_methods where stripe_payment_method_id = 'pm_Visa1'), 'visa', 'brands are stored in lower case');
select ok(exists (select 1 from public.audit_events where entity_type = 'payment_methods' and action = 'create' and context ->> 'actor_user_id' = :'owner'),
  'adding a card is audited with the person who did it');

-- Another organisation can't claim the same card.
select pg_temp.as_service();
select public.record_billing_customer(:'org2', 'cus_Other1', false, :'other');
select is(tests.error_code(format($$select public.record_payment_method(%L, 'pm_Visa1', 'visa', '4242', 12, 2030, false, null)$$, :'org2')), 'forbidden',
  'a card stays with its organisation');

-- Default and removal.
select public.set_default_payment_method_record(:'org', 'pm_Visa1', :'owner');
reset role;
select is((select stripe_payment_method_id from public.payment_methods where organisation_id = :'org' and is_default), 'pm_Visa1', 'the default can change');
select pg_temp.as_service();
select public.mark_payment_method_detached('pm_Visa1', :'owner');
select public.mark_payment_method_detached('pm_Visa1', :'owner');
reset role;
select is((select stripe_payment_method_id from public.payment_methods where organisation_id = :'org' and is_default and detached_at is null), 'pm_Mc1',
  'removing the default makes the remaining card the default');
select is((select count(*)::int from public.audit_events where entity_type = 'payment_methods' and action = 'delete'), 1, 'a removal is audited once');

-- Who can read what.
select tests.authenticate_as(:'owner', 'aal2');
select is((select count(*)::int from public.payment_methods), 2, 'the Owner sees the organisation''s cards');
select is((select count(*)::int from public.billing_customers), 1, 'and its Stripe customer');
reset role;
select tests.authenticate_as(:'fm', 'aal2');
select is((select count(*)::int from public.payment_methods), 0, 'a Fleet Manager does not');
reset role;
select tests.authenticate_as(:'other', 'aal2');
select is((select count(*)::int from public.payment_methods where organisation_id = :'org'), 0, 'nor does another organisation');
select is((select count(*)::int from public.stripe_events), 0, 'nobody reads the webhook log');
reset role;

-- Webhook log: once per event; a failed event is processed again.
select pg_temp.as_service();
select is(public.record_stripe_event('evt_1', 'setup_intent.succeeded', false), true, 'a new event is processed');
select is(public.record_stripe_event('evt_1', 'setup_intent.succeeded', false), false, 'a repeat delivery is not');
select public.finish_stripe_event('evt_1', 'Temporary failure');
select is(public.record_stripe_event('evt_1', 'setup_intent.succeeded', false), true, 'a failed event is processed again on the next delivery');
select public.finish_stripe_event('evt_1', null);
select is(public.record_stripe_event('evt_1', 'setup_intent.succeeded', false), false, 'and not after it succeeded');
reset role;

-- Fleet consent now works with a saved card.
select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format('select public.record_fleet_subscription_consent(%L, 3000, 5)', :'org'), 'the Owner agrees to the fleet subscription with a card saved');

select * from finish();
rollback;
