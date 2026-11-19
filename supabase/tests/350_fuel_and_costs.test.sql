-- 2C Expenditure: fuel records, cost rates and work order costs (CS-23, EXP-01..03).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.fc@example.test', 'Fay Owner') as owner \gset
select tests.create_user('tech.fc@example.test', 'Tom Tech') as tech \gset
select tests.create_user('op.fc@example.test', 'Ollie Operator') as op \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Fuel Pty') as org \gset
reset role;
select tests.add_member(:'org', :'tech', 'technician') as tech_m \gset
select tests.add_member(:'org', :'op', 'driver_operator') as op_m \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, meter_type)
values (:'org', 'FC-1', tests.class_id('excavator'), 'CAT', '320', 'hours') returning id as asset \gset
insert into public.asset_operator_permissions (organisation_id, membership_id, asset_id) values (:'org', :'op_m', :'asset');

-- EXP-02: a fill records quantity, reading and cost; the cost goes to cost lines only
select tests.authenticate_as(:'owner');
select public.record_fuel(:'asset', now(), 120.5, 'diesel', 'L', 24500, true, 'Ampol Caboolture', null, 1500) as fill1 \gset
select is((select quantity from public.fuel_records where id = :'fill1'), 120.50, 'the fill is recorded');
select is((select value from public.meter_readings where asset_id = :'asset' and source = 'fuel' order by read_at desc limit 1), 1500.0::numeric,
  'its hour meter reading is recorded on the equipment');
select is((select amount_cents from public.cost_lines where source_type = 'fuel_record' and source_id = :'fill1'), 24500::bigint, 'and its cost is posted once');
select is(tests.error_code(format($$select public.record_fuel(%L, now(), 50, 'diesel', 'L', 9000, true, null, null, 1400)$$, :'asset')), 'lower_reading_reason_required',
  'a lower reading needs a reason');
select is(tests.error_code(format($$select public.record_fuel(%L, now(), 0)$$, :'asset')), 'quantity_required', 'a quantity is needed');

-- Corrections are amendments with a reason; the old cost is reversed
select is(tests.error_code(format($$select public.record_fuel(%L, now(), 100, 'diesel', 'L', 20000, true, null, null, null, null, false, '{}', null, null, %L, '')$$,
  :'asset', :'fill1')), 'reason_required', 'a correction needs a reason');
select public.record_fuel(:'asset', now(), 102.5, 'diesel', 'L', 20800, true, 'Ampol Caboolture', null, null, null, false, '{}', null, null, :'fill1', 'Wrong litres keyed') as fill2 \gset
select ok((select superseded_at is not null from public.fuel_records where id = :'fill1'), 'the original is kept as superseded');
select is((select sum(amount_cents) from public.cost_lines where source_type = 'fuel_record'), 20800::numeric, 'and only the corrected cost counts');
select is(tests.error_code(format($$select public.record_fuel(%L, now(), 100, 'diesel', 'L', 1, true, null, null, null, null, false, '{}', null, null, %L, 'Again')$$,
  :'asset', :'fill1')), 'not_found', 'a superseded record cannot be corrected again');
reset role;

-- EXP-03: operators record fuel but never see costs or rates
select tests.authenticate_as(:'op');
select is((select count(*) from public.fuel_records)::int, 2, 'operators see fuel records for their equipment');
select is((select count(*) from public.cost_lines)::int, 0, 'but no cost lines');
reset role;

-- Technician cost rates
select tests.authenticate_as(:'owner');
select lives_ok(format($$select public.set_cost_rate(%L, %L, 9500)$$, :'org', :'tech'), 'the Owner sets a technician''s cost rate');
reset role;
select tests.authenticate_as(:'tech');
select is((select count(*) from public.workforce_cost_rates)::int, 0, 'technicians never see rates, including their own');
select is(tests.error_code(format($$select public.set_cost_rate(%L, %L, 1)$$, :'org', :'tech')), 'forbidden', 'and cannot set them');
reset role;

-- EXP-01 / 9.2: closing a work order posts labour and other costs once; reopening reverses them
select tests.authenticate_as(:'owner');
select public.create_work_order(:'org', :'asset', 'Track repair', null, 'internal', null, 'normal', :'tech') as wo \gset
reset role;
select (:'wo'::jsonb ->> 'id') as wo_id \gset
update public.work_orders set status = 'completed', completed_at = now(), completed_by = :'tech', labour_hours = 2.5, cost_cents = 15000 where id = :'wo_id';
select tests.authenticate_as(:'owner');
select lives_ok(format($$select public.update_work_order_status(%L, 'close', 'Checked')$$, :'wo_id'), 'the Owner closes it');
select is((select amount_cents from public.cost_lines where work_order_id = :'wo_id' and kind = 'labour'), 23750::bigint, 'labour: 2.5 h × $95 = $237.50');
select is((select amount_cents from public.cost_lines where work_order_id = :'wo_id' and kind = 'other'), 15000::bigint, 'other costs: $150');
select lives_ok(format($$select public.update_work_order_status(%L, 'reopen', 'Leak returned')$$, :'wo_id'), 'reopened');
select is((select sum(amount_cents) from public.cost_lines where work_order_id = :'wo_id'), 0::numeric, 'reopening reverses the posted costs');
reset role;
update public.work_orders set status = 'completed', labour_hours = 1, cost_cents = null where id = :'wo_id';
select tests.authenticate_as(:'owner');
select lives_ok(format($$select public.update_work_order_status(%L, 'close', 'Fixed')$$, :'wo_id'), 'closed again');
select is((select sum(amount_cents) from public.cost_lines where work_order_id = :'wo_id'), 9500::numeric, 'the new closure posts its own costs');
reset role;

select * from finish();
rollback;
