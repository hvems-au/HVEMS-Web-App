-- 2C Parts: requests, approval by limit, orders, receiving, fitting and costs (CS-20, PRT-01..07).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.pr@example.test', 'Pam Owner') as owner \gset
select tests.create_user('fm.pr@example.test', 'Phil Fleet') as fm \gset
select tests.create_user('tech.pr@example.test', 'Tara Tech') as tech \gset
select tests.create_user('fin.pr@example.test', 'Fred Finance') as fin \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Parts Pty') as org \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'tech', 'technician') as tech_m \gset
select tests.add_member(:'org', :'fin', 'finance') as fin_m \gset
-- Approval limits: technician $500, Finance $2,000 (the Owner has no limit).
insert into public.membership_grants (organisation_id, membership_id, grant_type, approval_limit_cents) values
  (:'org', :'tech_m', 'approval_limit', 50000),
  (:'org', :'fin_m', 'approval_limit', 200000);
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model)
values (:'org', 'PR-1', tests.class_id('excavator'), 'CAT', '320') returning id as asset \gset
insert into public.suppliers (organisation_id, name) values (:'org', 'Coates Parts') returning id as supplier \gset
select public.create_work_order(:'org', :'asset', 'Hydraulic repair', null, 'internal', null, 'normal', :'tech') as wo \gset
select (:'wo'::jsonb ->> 'id') as wo_id \gset

-- PRT-02: within the requester's limit → approved automatically
select tests.authenticate_as(:'tech');
select public.save_parts_request(:'org', null, :'asset', :'wo_id', 'urgent', current_date + 3, null, null,
  '[{"description": "Hydraulic hose", "quantity": 2, "est_unit_cost_cents": 12000}]'::jsonb, true) as small \gset
select is(:'small'::jsonb ->> 'status', 'approved', '$240 from a $500-limit technician is approved automatically');
select ok((select auto_approved from public.parts_requests where id = (:'small'::jsonb ->> 'id')::uuid), 'and the automatic approval is recorded');
select is((select count(*) from public.parts_line_prices)::int, 0, 'technicians never see prices on file');

-- PRT-02: over the limit → routed to members with enough limit
select public.save_parts_request(:'org', null, :'asset', :'wo_id', 'normal', null, null, null,
  '[{"description": "Pump", "quantity": 1, "est_unit_cost_cents": 90000}]'::jsonb, true) as big \gset
select is(:'big'::jsonb ->> 'status', 'submitted', 'a $900 request from a $500-limit technician needs approval');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = :'fin' and kind = 'parts_approval'), 'Finance ($2,000 limit) is asked to approve');
select ok(exists (select 1 from public.notifications where recipient_id = :'owner' and kind = 'parts_approval'), 'and the Owner (no limit)');
select ok(not exists (select 1 from public.notifications where recipient_id = :'tech' and kind = 'parts_approval'), 'but not the requester');
select tests.authenticate_as(:'fm');
select is(tests.error_code(format($$select public.decide_parts_request(%L, true)$$, :'big'::jsonb ->> 'id')), 'limit_too_low',
  'a Fleet Manager without an Approval Limit cannot approve');
reset role;
select tests.authenticate_as(:'fin');
select is(tests.error_code(format($$select public.decide_parts_request(%L, false, '')$$, :'big'::jsonb ->> 'id')), 'reason_required',
  'rejecting needs a reason');
select lives_ok(format($$select public.decide_parts_request(%L, true)$$, :'big'::jsonb ->> 'id'), 'Finance approves it');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = :'tech' and kind = 'parts_decision'), 'the requester is told');

-- PRT-03: order at 11% over the approved price → re-approval
select id as big_line from public.parts_request_lines where request_id = (:'big'::jsonb ->> 'id')::uuid \gset
select tests.authenticate_as(:'tech');
select is(tests.error_code(format($$select public.record_parts_order(%L, %L, 'PO-1', current_date, null, 90000)$$, :'big_line', :'supplier')), 'forbidden',
  'technicians do not record orders');
reset role;
select tests.authenticate_as(:'fm');
select is((public.record_parts_order(:'big_line', :'supplier', 'PO-77', current_date, current_date + 2, 99900) ->> 'reapproval')::boolean, true,
  'an actual price 11% over the approved estimate needs approval again');
select is((select status from public.parts_requests where id = (:'big'::jsonb ->> 'id')::uuid), 'submitted', 'the request is back with approvers');
reset role;
select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$select public.decide_parts_request(%L, true)$$, :'big'::jsonb ->> 'id'), 'the Owner re-approves');
select is((select status from public.parts_requests where id = (:'big'::jsonb ->> 'id')::uuid), 'ordered', 'and it is ordered');
reset role;

-- PRT-04: receiving 2 of 5 leaves 3 outstanding
select tests.authenticate_as(:'tech');
select public.save_parts_request(:'org', null, :'asset', :'wo_id', 'normal', null, null, null,
  '[{"description": "Filter", "quantity": 5, "est_unit_cost_cents": 2000}]'::jsonb, true) as filters \gset
reset role;
select id as f_line from public.parts_request_lines where request_id = (:'filters'::jsonb ->> 'id')::uuid \gset
select tests.authenticate_as(:'fm');
select public.record_parts_order(:'f_line', :'supplier', 'PO-80', current_date, null, 2000);
select lives_ok(format($$select public.receive_parts(%L, 'receipt', 2)$$, :'f_line'), 'receive 2 of 5');
select is((select quantity - received_qty from public.parts_request_lines where id = :'f_line'), 3.00, '3 outstanding');
select is((select status from public.parts_requests where id = (:'filters'::jsonb ->> 'id')::uuid), 'partially_received', 'status Partially received');
select is(tests.error_code(format($$select public.receive_parts(%L, 'receipt', 4)$$, :'f_line')), 'too_many', 'cannot receive more than ordered');
select is(tests.error_code(format($$select public.receive_parts(%L, 'return_to_supplier', 1)$$, :'f_line')), 'reason_required', 'returns need a reason');
reset role;

-- PRT-05: fitting then returning leaves the cost unchanged; cost posted once
select tests.authenticate_as(:'tech');
select public.fit_parts(:'wo_id', :'f_line', 2) as fit1 \gset
select is(tests.error_code(format($$select public.fit_parts(%L, %L, 1)$$, :'wo_id', :'f_line')), 'too_many', 'only received parts can be fitted');
select is((select count(*) from public.cost_lines)::int, 0, 'technicians never see cost lines');
reset role;
select is((select sum(amount_cents) from public.cost_lines where work_order_id = :'wo_id'), 4000::numeric, 'fitting 2 × $20 posts $40 once');
select tests.authenticate_as(:'tech');
select is(tests.error_code(format($$select public.return_fitted_part(%L, '')$$, :'fit1')), 'reason_required', 'returns from a job need a reason');
select lives_ok(format($$select public.return_fitted_part(%L, 'Wrong size')$$, :'fit1'), 'the technician returns it');
select is(tests.error_code(format($$select public.return_fitted_part(%L, 'Again')$$, :'fit1')), 'already_returned', 'a fit is returned only once');
reset role;
select is((select sum(amount_cents) from public.cost_lines where work_order_id = :'wo_id'), 0::numeric, 'fitting then returning leaves the cost unchanged');
select is(tests.error_code(format($$update public.cost_lines set amount_cents = 1 where work_order_id = %L$$, :'wo_id')), 'append_only', 'cost lines are never edited');

-- Bought on the spot
select tests.authenticate_as(:'tech');
select lives_ok(format($$select public.fit_parts(%L, null, 1, 'Cable ties (pack)', 850, 'Bunnings')$$, :'wo_id'), 'parts bought on the spot can be fitted');
reset role;
select is((select sum(amount_cents) from public.cost_lines where work_order_id = :'wo_id'), 850::numeric, 'and post their cost');

-- Cancel
select tests.authenticate_as(:'tech');
select is(tests.error_code(format($$select public.cancel_parts_request(%L, 'No longer needed')$$, :'filters'::jsonb ->> 'id')), 'invalid_status',
  'an ordered request cannot be cancelled');
reset role;

select * from finish();
rollback;
