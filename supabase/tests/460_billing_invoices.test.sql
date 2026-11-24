-- Billing slice 2: monthly invoices, outcomes and restriction for non-payment.
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

select date_trunc('month', (now() at time zone 'Australia/Brisbane') - interval '1 month')::date as last_month \gset
select (date_trunc('month', (now() at time zone 'Australia/Brisbane') - interval '1 month')::timestamp at time zone 'Australia/Brisbane') as lm_start \gset

select tests.create_user('owner.i@example.test', 'Iris Owner') as owner \gset
select tests.create_user('fm.i@example.test', 'Ivan Fleet') as fm \gset
select tests.create_user('owner2.i@example.test', 'Ida Owner') as owner2 \gset
select tests.create_user('prov.i@example.test', 'Pat Provider') as prov \gset
select tests.create_user('prov2.i@example.test', 'Pip Founder') as prov2 \gset
select tests.authenticate_as(:'owner', 'aal2');
select public.create_organisation('company', 'India Civil') as org \gset
reset role;
select tests.authenticate_as(:'owner2', 'aal2');
select public.create_organisation('company', 'Intro Co') as org2 \gset
reset role;
select tests.authenticate_as(:'prov', 'aal2');
select public.create_organisation('provider', 'Pat Diesel') as porg \gset
reset role;
select tests.authenticate_as(:'prov2', 'aal2');
select public.create_organisation('provider', 'Founding Fixers') as porg2 \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');

-- Last month: India Civil went from 0 to 7 assets, then down to 4 (highest 7). It first went above 5 three months ago.
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
values (:'org', 'EX-I1', tests.class_id('excavator'), 'CAT', '320', 'SNI1', 'hours') returning id as asset \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
values (:'org2', 'EX-J1', tests.class_id('excavator'), 'CAT', '320', 'SNJ1', 'hours') returning id as asset2 \gset
-- Replace the "now" events with last month's history.
alter table public.asset_count_events disable trigger asset_count_events_immutable;
delete from public.asset_count_events;
alter table public.asset_count_events enable trigger asset_count_events_immutable;
insert into public.asset_count_events (organisation_id, asset_id, delta, reason, occurred_at)
select :'org', :'asset', 1, 'created', :'lm_start'::timestamptz + make_interval(hours => g) from generate_series(1, 7) g;
insert into public.asset_count_events (organisation_id, asset_id, delta, reason, occurred_at)
select :'org', :'asset', -1, 'archived', :'lm_start'::timestamptz + make_interval(days => 3, hours => g) from generate_series(1, 3) g;
insert into public.asset_count_events (organisation_id, asset_id, delta, reason, occurred_at)
select :'org2', :'asset2', 1, 'created', :'lm_start'::timestamptz + make_interval(hours => g) from generate_series(1, 8) g;
update public.organisations set first_exceeded_free_allowance_at = now() - interval '3 months' where id = :'org';
update public.organisations set first_exceeded_free_allowance_at = :'lm_start'::timestamptz + interval '6 hours' where id = :'org2';

select is(app.highest_asset_count(:'org', :'last_month'), 7, 'the highest count in the month is used');

-- Providers: one verified 6 months ago (after the founding window), one founding provider.
insert into public.provider_profiles (organisation_id, status) values (:'porg', 'verified'), (:'porg2', 'verified');

-- Off by default.
select pg_temp.as_service();
select is(public.prepare_monthly_invoices(null), 0, 'nothing is invoiced while billing.invoicing_live is off');
reset role;
update public.platform_settings set value = 'true' where key = 'billing.invoicing_live';

-- Before the public launch: fleet only.
select pg_temp.as_service();
select is(public.prepare_monthly_invoices(null), 1, 'one fleet invoice');
reset role;
select is((select amount_cents from public.billing_invoices where organisation_id = :'org'), 6000::bigint, '(7 − 5) × $30 = $60');
select ok((select description like 'Fleet subscription, %: 7 assets (5 free) at $30.00' from public.billing_invoices where organisation_id = :'org'),
  'the invoice says how it was worked out');
select is((select count(*)::int from public.billing_invoices where organisation_id = :'org2'), 0, 'the month a company first went above 5 is free');
select is((select count(*)::int from public.billing_invoices where kind = 'provider'), 0, 'no provider subscription before the public launch');

-- After the launch (100 days before last month): Pat Diesel was verified after the 90-day founding window and before
-- last month, so it pays; Founding Fixers was verified 20 days after launch, so its 3 free months run past last month.
update public.platform_settings set value = to_jsonb((:'lm_start'::timestamptz - interval '100 days')::text) where key = 'marketplace.public_launch_at';
update public.provider_profiles set first_verified_at = :'lm_start'::timestamptz - interval '5 days' where organisation_id = :'porg';
update public.provider_profiles set first_verified_at = :'lm_start'::timestamptz - interval '80 days' where organisation_id = :'porg2';
select pg_temp.as_service();
select is(public.prepare_monthly_invoices(null), 1, 'the provider subscription is added once launched');
select is(public.prepare_monthly_invoices(null), 0, 'running it again adds nothing');
reset role;
select is((select amount_cents from public.billing_invoices where organisation_id = :'porg'), 9900::bigint, 'the provider pays $99');
select is((select count(*)::int from public.billing_invoices where organisation_id = :'porg2'), 0, 'a founding provider pays nothing in its first 3 months');
select is((select gst_cents from public.billing_invoices where organisation_id = :'org'), 0::bigint, 'no GST while HVEMS is not registered');

select pg_temp.as_service();
select is(tests.error_code($$select public.prepare_monthly_invoices(current_date)$$), 'month_not_finished', 'the current month cannot be invoiced');
reset role;

-- Who sees invoices.
select tests.authenticate_as(:'owner', 'aal2');
select is((select count(*)::int from public.billing_invoices), 1, 'the Owner sees the company''s invoice');
select is(tests.error_code($$select public.prepare_monthly_invoices(null)$$), '42501', 'members cannot create invoices');
reset role;
select tests.authenticate_as(:'fm', 'aal2');
select is((select count(*)::int from public.billing_invoices), 0, 'a Fleet Manager does not');
reset role;

-- Sending and outcomes.
select id as inv from public.billing_invoices where organisation_id = :'org' \gset
select pg_temp.as_service();
select is((select count(*)::int from public.claim_draft_invoices(10)), 2, 'the server claims the drafts');
select public.record_invoice_outcome(:'inv', 'in_Test1', 'open', 'HV-0001', 'https://invoice.stripe.com/i/x', 'https://pay.stripe.com/x.pdf');
reset role;
select ok(exists (select 1 from public.notifications where organisation_id = :'org' and recipient_id = :'owner' and kind = 'billing_invoice'),
  'billing managers are told about a new invoice');
select ok(not exists (select 1 from public.notifications where organisation_id = :'org' and recipient_id = :'fm' and kind like 'billing%'),
  'other members are not');
select is(app.notification_group('billing_payment_failed'), 'account', 'billing notices are always emailed');

select pg_temp.as_service();
select public.record_invoice_outcome(null, 'in_Test1', 'failed', null, null, null, 'Your card was declined.');
reset role;
select is((select status || '|' || last_error from public.billing_invoices where id = :'inv'), 'failed|Your card was declined.', 'a failed payment is recorded');
select ok(exists (select 1 from public.notifications where organisation_id = :'org' and kind = 'billing_payment_failed'), 'and the billing managers told');

-- Not yet restricted; after 14 days unpaid it is.
select is(app.sweep_billing_restrictions(), 0, 'no restriction within the grace period');
update public.billing_invoices set first_failed_at = now() - interval '15 days' where id = :'inv';
select is(app.sweep_billing_restrictions(), 1, 'restricted after 14 days unpaid');
select is((select status::text from public.organisations where id = :'org'), 'restricted', 'the account is restricted');
select ok(exists (select 1 from public.audit_events where entity_type = 'organisations' and action = 'restrict' and organisation_id = :'org'), 'and audited');

-- Paying lifts it; a late failure never undoes the payment.
select pg_temp.as_service();
select public.record_invoice_outcome(null, 'in_Test1', 'paid', 'HV-0001');
select public.record_invoice_outcome(null, 'in_Test1', 'failed', null, null, null, 'Late event');
reset role;
select is((select status from public.billing_invoices where id = :'inv'), 'paid', 'the invoice is paid');
select is((select status::text from public.organisations where id = :'org'), 'active', 'paying lifts the restriction');
select ok(exists (select 1 from public.notifications where organisation_id = :'org' and kind = 'billing_restored'), 'and says so');

-- First verification date is set automatically.
update public.provider_profiles set status = 'submitted', first_verified_at = null where organisation_id = :'porg2';
update public.provider_profiles set status = 'verified' where organisation_id = :'porg2';
select ok((select first_verified_at is not null from public.provider_profiles where organisation_id = :'porg2'), 'verification records the first verified date');

select * from finish();
rollback;
