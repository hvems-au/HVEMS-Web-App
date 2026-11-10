-- Holds, breakdowns, regulator defect notices, critical alerts with
-- acknowledgement and escalation (SoW §3.4, CS-13, CS-15, CS-16).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.r@example.test', 'Rae Owner') as owner \gset
select tests.create_user('fm.r@example.test', 'Ron Fleet') as fm \gset
select tests.create_user('admin.r@example.test', 'Ria Admin') as adm \gset
select tests.create_user('driver.r@example.test', 'Rex Driver') as driver \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Romeo Road') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, registration_number, registration_state, vin, meter_type)
  values (:'org', 'PM-R1', tests.class_id('prime_mover'), 'Kenworth', 'T610', 'R1', 'QLD', 'VINR1', 'kilometres') returning id as pm \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'adm', 'administrator') as adm_m \gset
select tests.add_member(:'org', :'driver', 'driver_operator') as driver_m \gset
insert into public.asset_operator_permissions (organisation_id, membership_id, asset_id) values (:'org', :'driver_m', :'pm');

create function pg_temp.cond() returns text language sql as $$ select condition::text from public.assets where asset_number = 'PM-R1' $$;

-- Holds
select tests.authenticate_as(:'driver');
select is(tests.error_code(format($$select public.place_hold(%L, 'out_of_service', 'Recall')$$, :'pm')), 'forbidden', 'drivers cannot place holds');
reset role;
select tests.authenticate_as(:'fm');
select is(tests.error_code(format($$select public.place_hold(%L, 'out_of_service', '')$$, :'pm')), 'reason_required', 'a hold needs a reason');
select public.place_hold(:'pm', 'out_of_service', 'Brake recall') as hold \gset
select is(pg_temp.cond(), 'out_of_service', 'an Out-of-service hold takes the truck out of service');
select is((select count(*)::int from public.critical_alerts where source_type = 'hold'), 1, 'a critical alert is raised');
reset role;
select is((select count(*)::int from public.notifications where kind = 'out_of_service_hold'), 2, 'the Owner and the Fleet Manager are notified (not the Admin yet)');

-- Escalation
select is(app.escalate_alerts(now() + interval '10 minutes'), 0, 'nothing escalates before 30 minutes');
select is(app.escalate_alerts(now() + interval '31 minutes'), 1, 'escalated at 30 minutes');
select is(app.escalate_alerts(now() + interval '31 minutes'), 0, 'not escalated twice at the same level');
select is((select count(*)::int from public.notifications n join public.org_memberships m on m.user_id = n.recipient_id and m.organisation_id = n.organisation_id
           where n.kind = 'alert_escalated' and m.role = 'administrator'), 1, 'escalation also tells Company Admins');
select is(app.escalate_alerts(now() + interval '121 minutes'), 1, 'escalated again at 2 hours');
select is((select escalation_level from public.critical_alerts where source_type = 'hold'), 2::smallint, 'at the second level');

select id as hold_alert from public.critical_alerts where source_type = 'hold' \gset
select tests.authenticate_as(:'driver');
select is((select count(*)::int from public.critical_alerts), 0, 'drivers cannot see alerts');
select is(tests.error_code(format($$select public.acknowledge_alert(%L)$$, :'hold_alert')), 'forbidden', 'drivers cannot acknowledge alerts');
reset role;
select tests.authenticate_as(:'fm');
select lives_ok(format($$select public.acknowledge_alert(%L)$$, (select id from public.critical_alerts where source_type = 'hold')), 'the Fleet Manager acknowledges');
select is((select acknowledged_by from public.critical_alerts where source_type = 'hold'), :'fm'::uuid, 'who acknowledged is recorded');

-- Removing the hold is step 1 of 2.
select is((public.remove_hold(:'hold', 'Recall work done') ->> 'awaiting_return_to_service')::boolean, true, 'removing the hold leaves it awaiting return');
select is(pg_temp.cond(), 'out_of_service', 'still Out of service');
select lives_ok(format($$select public.return_to_service(%L, 'Checked')$$, :'pm'), 'returned to service');
select is(pg_temp.cond(), 'active', 'Active again');
reset role;

-- Breakdown reported by a driver; resolving it acknowledges its alert.
select tests.authenticate_as(:'driver');
select public.report_breakdown(:'pm', 'Air leak, no brake pressure', 'Gateway Mwy') as bd \gset
select is(pg_temp.cond(), 'out_of_service', 'a breakdown takes the truck out of service');
select is(tests.error_code(format($$select public.resolve_breakdown(%L, 'Fixed')$$, :'bd')), 'forbidden', 'drivers cannot resolve breakdowns');
reset role;
select tests.authenticate_as(:'fm');
select lives_ok(format($$select public.resolve_breakdown(%L, 'Air line replaced')$$, :'bd'), 'the Fleet Manager resolves it');
select ok((select acknowledged_at is not null from public.critical_alerts where source_type = 'breakdown'), 'resolving acknowledges the alert');
select is(pg_temp.cond(), 'out_of_service', 'awaiting return to service');
select lives_ok(format($$select public.return_to_service(%L, 'Brake test passed')$$, :'pm'), 'returned to service');

-- Regulator notices
select is(tests.error_code(format($$select public.record_regulator_notice(%L, 'NHVR', 'minor', current_date, 'Light out', null, current_date - 1)$$, :'pm')),
  'invalid_clear_by', 'clear-by cannot be before the issue date');
select public.record_regulator_notice(:'pm', 'NHVR', 'minor', current_date, 'Plate light out') as minor_n \gset
select is(pg_temp.cond(), 'needs_attention', 'a Minor notice: Needs attention');
select is(tests.error_code(format($$select public.clear_regulator_notice(%L, current_date, '')$$, :'minor_n')), 'clearance_reference_required',
  'clearing needs a reference');
select lives_ok(format($$select public.clear_regulator_notice(%L, current_date, 'Fixed at depot')$$, :'minor_n'), 'the Minor notice is cleared');
select is(pg_temp.cond(), 'active', 'Active once cleared');
select public.record_regulator_notice(:'pm', 'QPS', 'major', current_date, 'Steer tyre cord showing') as major_n \gset
select is(pg_temp.cond(), 'out_of_service', 'a Major notice: Out of service');
select is((select count(*)::int from public.critical_alerts where source_type = 'regulator_notice'), 1, 'and a critical alert');
reset role;

select * from finish();
rollback;
