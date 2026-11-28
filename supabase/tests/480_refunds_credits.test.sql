-- Billing slice 4: refunds, credits and waiver adjustments with a second approver above the threshold.
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

select tests.create_user('owner.rf@example.test', 'Rita Owner') as owner \gset
select tests.create_user('admin.rf@example.test', 'Adam Admin') as admin1 \gset
select tests.create_user('approver.rf@example.test', 'Bea Approver') as approver \gset
select tests.create_user('agent.rf@example.test', 'Sid Support') as agent \gset
insert into public.platform_staff (user_id, role, authorities) values
  (:'admin1', 'platform_administrator', '{}'),
  (:'approver', 'support_agent', array['billing_approver']::public.platform_authority[]),
  (:'agent', 'support_agent', '{}');

select tests.authenticate_as(:'owner', 'aal2');
select public.create_organisation('company', 'Redcliffe Haulage') as org \gset
reset role;

-- A paid invoice of $900 to refund.
insert into public.billing_invoices (organisation_id, kind, period_start, description, amount_cents, status, stripe_invoice_id, paid_at)
values (:'org', 'fleet', date_trunc('month', now() - interval '1 month')::date, 'Fleet subscription', 90000, 'paid', 'in_Paid1', now())
returning id as inv \gset
insert into public.billing_invoices (organisation_id, kind, period_start, description, amount_cents, status)
values (:'org', 'fleet', date_trunc('month', now() - interval '2 months')::date, 'Fleet subscription', 6000, 'open')
returning id as open_inv \gset

-- Who may.
select tests.authenticate_as(:'agent', 'aal2');
select is(tests.error_code(format($$select public.request_billing_adjustment(%L, 'credit', 1000, 'Goodwill')$$, :'org')), 'forbidden',
  'a support agent without the authority can''t refund or credit');
reset role;
select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code(format($$select public.request_billing_adjustment(%L, 'credit', 1000, 'Goodwill')$$, :'org')), 'forbidden', 'customers can''t');
reset role;

-- Rules.
select tests.authenticate_as(:'admin1', 'aal2');
select is(tests.error_code(format($$select public.request_billing_adjustment(%L, 'refund', 1000, 'x', %L)$$, :'org', :'inv')), 'reason_required', 'a reason is required');
select is(tests.error_code(format($$select public.request_billing_adjustment(%L, 'refund', 1000, 'Overcharged', %L)$$, :'org', :'open_inv')), 'not_refundable',
  'only a paid invoice can be refunded');
select is(tests.error_code(format($$select public.request_billing_adjustment(%L, 'refund', 90001, 'Overcharged', %L)$$, :'org', :'inv')), 'amount_too_high',
  'no more than was paid');

-- At or under $500: approved at once by the one approver.
select public.request_billing_adjustment(:'org', 'refund', 20000, 'Charged for an archived asset', :'inv') as small \gset
select is((select status from public.billing_adjustments where id = :'small'), 'approved', '$200 needs one approver');

-- Over $500: waits for a second, different approver.
select is(tests.error_code(format($$select public.request_billing_adjustment(%L, 'refund', 70001, 'Whole month wrong', %L)$$, :'org', :'inv')), 'amount_too_high',
  'refunds so far count: only $700 is left');
select public.request_billing_adjustment(:'org', 'refund', 70000, 'Whole month wrong', :'inv') as big \gset
select is((select status from public.billing_adjustments where id = :'big'), 'pending_approval', '$700 waits for a second approval');
select is(tests.error_code(format($$select public.decide_billing_adjustment(%L, true)$$, :'big')), 'second_approver_required', 'the requester can''t approve it');
reset role;
select pg_temp.as_service();
select is((select count(*)::int from public.claim_billing_adjustments(null, 10)), 1, 'only the approved one is carried out (not the one waiting)');
reset role;
select tests.authenticate_as(:'approver', 'aal2');
select is(tests.error_code(format($$select public.decide_billing_adjustment(%L, false, '')$$, :'big')), 'reason_required', 'a rejection needs a reason');
select public.decide_billing_adjustment(:'big', true, 'Checked the asset history');
reset role;
select is((select status || '|' || (approved_by = :'approver'::uuid) from public.billing_adjustments where id = :'big'), 'approved|true', 'a second approver approves it');

-- The server carries them out.
select pg_temp.as_service();
select is((select payment_intent is null and stripe_invoice_id = 'in_Paid1' from public.claim_billing_adjustments(:'big', 1)), true, 'the server gets the invoice to refund');
select public.complete_billing_adjustment(:'big', true, 're_Big1');
select public.complete_billing_adjustment(:'small', false, null, 'Network error');
reset role;
select is((select status from public.billing_adjustments where id = :'big'), 'completed', 'done');
select is((select status from public.billing_adjustments where id = :'small'), 'failed', 'a Stripe failure is recorded');
select ok(exists (select 1 from public.notifications where organisation_id = :'org' and recipient_id = :'owner' and title like 'Refund issued: $700.00'),
  'the customer''s billing manager is told');
select tests.authenticate_as(:'approver', 'aal2');
select public.retry_billing_adjustment(:'small');
reset role;
select is((select status from public.billing_adjustments where id = :'small'), 'approved', 'a failed one can be retried');

-- Customers see completed refunds and credits only.
select tests.authenticate_as(:'owner', 'aal2');
select is((select count(*)::int from public.billing_adjustments), 1, 'the owner sees the completed refund only');
select is((select count(*)::int from public.billing_adjustments where reason is not null), 1, 'with its amount');
reset role;

-- Credits and waivers.
select tests.authenticate_as(:'approver', 'aal2');
select public.request_billing_adjustment(:'org', 'credit', 5000, 'Outage on 3 November') as credit \gset
select is((select status from public.billing_adjustments where id = :'credit'), 'approved', 'a $50 credit is approved at once');
select public.request_billing_adjustment(:'org', 'waiver_restore', 0, 'Provider cancelled: waiver back', null, null, null, 2) as w \gset
select is((select status from public.billing_adjustments where id = :'w'), 'completed', 'waivers are restored at once (no money moves)');
reset role;
select is((select count(*)::int from public.company_waivers where organisation_id = :'org' and month = app.waiver_month() and status = 'available'), 2,
  'two waivers added to this month');

select * from finish();
rollback;
