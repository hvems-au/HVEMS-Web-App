-- Equipment register, consent guard, archiving, condition engine, meter
-- readings and import. Covers brief critical tests 4, 5, 6 (engine level) and
-- SoW §3.1, §3.4, §5.2.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner@alpha.test', 'Olivia Owner') as owner \gset
select tests.create_user('admin@alpha.test', 'Adam Admin') as admin \gset
select tests.create_user('fm@alpha.test', 'Fiona Fleet') as fm \gset
select tests.create_user('driver@alpha.test', 'Dan Driver') as driver \gset
select tests.create_user('finance@alpha.test', 'Fred Finance') as finance \gset

select tests.authenticate_as(:'owner', 'aal2');
select public.create_organisation('company', 'Alpha Haulage') as org \gset
reset role;
select tests.add_member(:'org', :'admin', 'administrator') as admin_m \gset
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'driver', 'driver_operator') as driver_m \gset
select tests.add_member(:'org', :'finance', 'finance') as finance_m \gset

-- ------------------------------------------------- register rules (SoW §3.1)
select tests.authenticate_as(:'admin');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model)
  values (%L, 'EX-1', %L, 'CAT', '336F')$$, :'org', tests.class_id('excavator'))), 'asset_invalid',
  'equipment classes require a serial number');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'PM-1', %L, 'Kenworth', 'T909', 'X')$$, :'org', tests.class_id('prime_mover'))), 'asset_invalid',
  'vehicle classes require registration, state and VIN');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, year, registration_number, registration_state, vin, meter_type)
values (:'org', 'PM-001', tests.class_id('prime_mover'), 'Kenworth', 'T909', 2021, 'abc123', 'QLD', '1hgcm82633a004352', 'kilometres')
returning id as truck \gset
select is((select vin from public.assets where id = :'truck'), '1HGCM82633A004352', 'VIN and registration are normalised to upper case');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'pm-001', %L, 'CAT', '336F', 'S-9')$$, :'org', tests.class_id('excavator'))), 'asset_invalid',
  'a duplicate asset number is refused (case-insensitive)');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, registration_number, registration_state, vin)
  values (%L, 'PM-002', %L, 'Volvo', 'FH16', 'XYZ789', 'QLD', '1HGCM82633A004352')$$, :'org', tests.class_id('prime_mover'))), 'asset_invalid',
  'a duplicate VIN needs a reason');
select lives_ok(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, registration_number, registration_state, vin, duplicate_reason)
  values (%L, 'PM-002', %L, 'Volvo', 'FH16', 'XYZ789', 'QLD', '1HGCM82633A004352', 'Re-shelled chassis, VIN plate retained')$$, :'org', tests.class_id('prime_mover')),
  'a duplicate VIN is accepted with a reason');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, owner_type)
  values (%L, 'EX-2', %L, 'CAT', '336F', 'S-10', 'client_owned')$$, :'org', tests.class_id('excavator'))), 'asset_invalid',
  'client-owned assets need a client');

-- ------------------------------- critical test 4/5: condition is not writable
select is(tests.error_code(format($$update public.assets set condition = 'out_of_service' where id = %L$$, :'truck')), '42501',
  'no role can set an asset''s condition by hand (update)');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, condition)
  values (%L, 'EX-3', %L, 'CAT', '336F', 'S-11', 'active')$$, :'org', tests.class_id('excavator'))), '42501',
  'no role can set an asset''s condition by hand (insert)');
select is(tests.error_code(format($$update public.assets set archived_at = now() where id = %L$$, :'truck')), '42501',
  'archiving is only possible through the archive workflow');
select is(tests.error_code(format($$select app.open_condition_cause(%L, 'critical_defect', 'defect', gen_random_uuid())$$, :'truck')), '42501',
  'API roles cannot open condition causes directly');
reset role;

select tests.authenticate_as(:'fm');
select is(tests.error_code(format($$select public.archive_asset(%L, 'Scrapped', current_date)$$, :'truck')), 'forbidden',
  'Fleet Managers cannot archive equipment (spec B.1: Owner/Administrator); test 050 covers create and edit');
reset role;

-- --------------------------------------- condition engine (SoW §3.4, as owner)
select is((select condition::text from public.assets where id = :'truck'), 'active', 'a new asset is Active');
select app.open_condition_cause(:'truck', 'minor_defect', 'defect', gen_random_uuid()) as minor_cause \gset
select is((select condition::text from public.assets where id = :'truck'), 'needs_attention', 'an open Minor defect makes the asset Needs attention');
select app.open_condition_cause(:'truck', 'critical_defect', 'defect', gen_random_uuid()) as critical_cause \gset
select is((select condition::text from public.assets where id = :'truck'), 'out_of_service', 'an open Critical defect makes the asset Broken/Out of service immediately');
select ok(not app.can_return_to_service(:'truck'), 'return to service is unavailable while a Critical defect is uncleared');
select app.resolve_condition_cause(:'critical_cause', 'cleared');
select is((select condition::text from public.assets where id = :'truck'), 'out_of_service',
  'clearing a Critical defect does not return the asset to service (separate step)');
select ok(app.can_return_to_service(:'truck'), 'return to service becomes available once the Critical defect is cleared');
select app.resolve_condition_cause((select id from public.asset_condition_causes where asset_id = :'truck'
  and kind = 'awaiting_return_to_service' and resolved_at is null), 'returned_to_service');
select is((select condition::text from public.assets where id = :'truck'), 'needs_attention',
  'after return to service the asset is Needs attention while a Minor defect remains');
select app.resolve_condition_cause(:'minor_cause', 'cleared');
select is((select condition::text from public.assets where id = :'truck'), 'active', 'with no open causes the asset is Active');
select app.open_condition_cause(:'truck', 'overdue_service', 'service_occurrence', gen_random_uuid()) as overdue \gset
select is((select condition::text from public.assets where id = :'truck'), 'active', 'an overdue service does not change condition unless the company rule is on');
update public.organisations set settings = settings || '{"overdue_service_sets_needs_attention": true}' where id = :'org';
select app.resolve_condition_cause(:'overdue', 'serviced');
select app.open_condition_cause(:'truck', 'overdue_service', 'service_occurrence', gen_random_uuid()) as overdue2 \gset
select is((select condition::text from public.assets where id = :'truck'), 'needs_attention', 'with the company rule on, an overdue service sets Needs attention');
select app.resolve_condition_cause(:'overdue2', 'serviced');
select app.open_condition_cause(:'truck', 'out_of_service_hold', 'hold', gen_random_uuid()) as hold \gset
select is((select condition::text from public.assets where id = :'truck'), 'out_of_service', 'an Out of service hold makes the asset Broken/Out of service');
select is((select count(*)::int from public.asset_condition_history where asset_id = :'truck'), 7, 'every condition change is recorded with its cause');
select is(tests.error_code(format($$delete from public.asset_condition_history where asset_id = %L$$, :'truck')), '42501',
  'condition history cannot be deleted');

-- ------------------------------------------------------------ meter readings
select tests.authenticate_as(:'driver');
select is((select count(*)::int from public.assets), 0, 'a driver sees no assets until permitted');
select is(tests.error_code(format($$select public.record_meter_reading(%L, 'km', 1000)$$, :'truck')), 'forbidden',
  'a driver cannot record readings for assets they are not permitted to operate');
reset role;
insert into public.asset_operator_permissions (organisation_id, membership_id, asset_id) values (:'org', :'driver_m', :'truck');
select tests.authenticate_as(:'driver');
select is((select count(*)::int from public.assets), 1, 'a driver sees only the assets they are permitted to operate');
select (public.record_meter_reading(:'truck', 'km', 150000, now() - interval '3 days', 'manual', 'aaaaaaaa-0000-4000-8000-000000000001')).id as r1 \gset
select is((select (public.record_meter_reading(:'truck', 'km', 150000, now() - interval '3 days', 'manual', 'aaaaaaaa-0000-4000-8000-000000000001')).id),
  :'r1'::uuid, 'retrying the same submission returns the original reading (idempotent)');
select is(tests.error_code(format($$select public.record_meter_reading(%L, 'hours', 10)$$, :'truck')), 'meter_type_mismatch',
  'readings must match the asset''s meter type');
select is(tests.error_code(format($$select public.record_meter_reading(%L, 'km', 160000, now() - interval '2 days')$$, :'truck')), 'implausible_jump_confirmation_required',
  'an implausible jump needs confirmation');
select lives_ok(format($$select public.record_meter_reading(%L, 'km', 160000, now() - interval '2 days', 'manual', null, null, true)$$, :'truck'),
  'a confirmed jump is accepted');
select is(tests.error_code(format($$select public.record_meter_reading(%L, 'km', 159000, now() - interval '1 day')$$, :'truck')), 'lower_reading_reason_required',
  'a lower reading needs a reason');
select (public.record_meter_reading(:'truck', 'km', 159000, now() - interval '1 day', 'manual', null, 'Odometer replaced')).id as lower_r \gset
reset role;
select is((select status::text from public.meter_readings where id = :'lower_r'), 'pending_acceptance', 'a lower reading waits for a manager');
select is((select current_odometer_km from public.assets where id = :'truck'), 160000.0, 'pending readings never overwrite the current reading');
select tests.authenticate_as(:'driver');
select is(tests.error_code(format($$select public.decide_meter_reading(%L, true)$$, :'lower_r')), 'forbidden', 'drivers cannot accept lower readings');
reset role;
select tests.authenticate_as(:'fm');
select lives_ok(format($$select public.decide_meter_reading(%L, true, 'Cluster replaced 3 Nov')$$, :'lower_r'), 'a Fleet Manager accepts the lower reading');
select public.amend_meter_reading(:'lower_r', 159100, 'Typo in the entered value') as amended \gset
reset role;
select is((select status::text from public.meter_readings where id = :'lower_r'), 'superseded', 'corrections keep the original as superseded');
select is((select amends_reading_id from public.meter_readings where id = :'amended'), :'lower_r'::uuid, 'the amendment references the original');
select is((select current_odometer_km from public.assets where id = :'truck'), 159100.0, 'the asset shows the latest accepted reading');
select tests.authenticate_as(:'driver');
select (public.record_meter_reading(:'truck', 'km', 155000, now() - interval '36 hours')).out_of_sequence as oos \gset
reset role;
select ok(:'oos'::boolean, 'a reading that arrives out of sequence is kept and flagged');

-- --------------------------------------- fleet consent guard (SoW §5.2)
select tests.authenticate_as(:'admin');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
select :'org', 'EX-' || g, tests.class_id('excavator'), 'CAT', '320', 'SER-' || g from generate_series(10, 12) g;
select is(app.current_asset_count(:'org'), 5, 'fixture: five current assets');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'EX-SIX', %L, 'CAT', '320', 'SER-SIX')$$, :'org', tests.class_id('excavator'))), 'fleet_consent_required',
  'a sixth current asset cannot be saved without fleet-subscription consent');
select is(tests.error_code(format($$select public.record_fleet_subscription_consent(%L, 3000, 5)$$, :'org')), 'forbidden',
  'Administrators cannot agree to the subscription (no billing authority)');
reset role;
select tests.authenticate_as(:'finance', 'aal2');
select is(tests.error_code(format($$select public.record_fleet_subscription_consent(%L, 3000, 5)$$, :'org')), 'payment_method_required',
  'consent needs a saved payment method');
reset role;
insert into public.payment_methods (organisation_id, stripe_payment_method_id, brand, last4, is_default)
values (:'org', 'pm_test_visa', 'visa', '4242', true);
select tests.authenticate_as(:'finance', 'aal1');
select is(tests.error_code(format($$select public.record_fleet_subscription_consent(%L, 3000, 5)$$, :'org')), 'mfa_required',
  'Finance must use MFA once a payment method is saved');
reset role;
select tests.authenticate_as(:'finance', 'aal2');
select is(tests.error_code(format($$select public.record_fleet_subscription_consent(%L, 2500, 5)$$, :'org')), 'price_changed',
  'consent must match the current price shown');
select lives_ok(format($$select public.record_fleet_subscription_consent(%L, 3000, 5)$$, :'org'), 'Finance records consent with the price shown');
reset role;
select tests.authenticate_as(:'admin');
select lives_ok(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'EX-SIX', %L, 'CAT', '320', 'SER-SIX')$$, :'org', tests.class_id('excavator')), 'the sixth asset saves after consent');
reset role;
select ok((select first_exceeded_free_allowance_at is not null from public.organisations where id = :'org'),
  'the month the company first exceeded five assets is recorded (introductory month)');

-- ------------------------------------------------------------------ archiving
select tests.authenticate_as(:'admin');
select is(tests.error_code(format($$select public.archive_asset(%L, '', current_date)$$, :'truck')), 'reason_required', 'archiving needs a reason');
select is(tests.error_code(format($$select public.archive_asset(%L, 'Sold to dealer', current_date, 'sold')$$, :'truck')),
  'open_issues_must_be_acknowledged', 'open defects and holds must be acknowledged before archiving for sale');
select lives_ok(format($$select public.archive_asset(%L, 'Sold to dealer', current_date, 'sold', true)$$, :'truck'), 'archive with acknowledgement');
update public.assets set notes = 'edited after archive' where id = :'truck';
select is((select notes from public.assets where id = :'truck'), null, 'archived assets cannot be edited');
reset role;
select is(app.current_asset_count(:'org'), 5, 'archived assets stop counting towards the subscription');
select is((select sum(delta)::int from public.asset_count_events where organisation_id = :'org'), 5, 'asset-count history matches the register');
select is(tests.error_code(format($$delete from public.asset_count_events where organisation_id = %L$$, :'org')), '42501',
  'asset-count history (billing evidence) cannot be deleted');

-- -------------------------------------------------------------- CSV import
select tests.authenticate_as(:'admin');
select public.import_assets(:'org', '[
  {"asset_number":"IMP-1","asset_class":"excavator","make":"CAT","model":"320"},
  {"asset_number":"IMP-2","asset_class":"spaceship","make":"X","model":"Y"},
  {"asset_number":"imp-1","asset_class":"loader","make":"CAT","model":"950","serial_number":"L1"},
  {"asset_number":"IMP-4","asset_class":"rigid_truck","make":"Isuzu","model":"FVZ","registration_number":"123ABC","registration_state":"QQ","vin":"V1"}
]'::jsonb, true) as dry \gset
select is((:'dry'::jsonb ->> 'valid')::boolean, false, 'a trial run with errors is reported as invalid');
select ok(jsonb_array_length(:'dry'::jsonb -> 'errors') >= 4, 'the trial run reports every row''s errors');
select ok((:'dry'::jsonb -> 'errors') @> '[{"row":1,"field":"serial_number"}]', 'row 1: missing serial number reported');
select ok((:'dry'::jsonb -> 'errors') @> '[{"row":2,"code":"invalid_class"}]', 'row 2: unknown class reported');
select ok((:'dry'::jsonb -> 'errors') @> '[{"row":3,"code":"duplicate_in_file"}]', 'row 3: duplicate in file reported');
select ok((:'dry'::jsonb -> 'errors') @> '[{"row":4,"code":"invalid_state"}]', 'row 4: invalid state reported');
select is(app.current_asset_count(:'org'), 5, 'a trial run saves nothing');
select is((public.import_assets(:'org', '[{"asset_number":"IMP-9","asset_class":"spaceship"}]'::jsonb, false) ->> 'created')::int, 0,
  'a real run with errors saves nothing');
select is((public.import_assets(:'org', '[
  {"asset_number":"IMP-10","asset_class":"excavator","make":"CAT","model":"320","serial_number":"S-I10","engine_hours":"1200"},
  {"asset_number":"IMP-11","asset_class":"portable_fixed_equipment","make":"Atlas Copco","model":"XAS 185"}
]'::jsonb, false) ->> 'created')::int, 2, 'a valid import creates every row');
select is((select current_engine_hours from public.assets where asset_number = 'IMP-10'), 1200.0, 'imported meter readings are recorded');
select is(tests.error_code(format($$select public.import_assets(%L, (select jsonb_agg(jsonb_build_object('asset_number', 'R' || g)) from generate_series(1, 1001) g), true)$$, :'org')),
  'too_many_rows', 'files are limited to 1,000 rows');
reset role;

select * from finish();
rollback;
