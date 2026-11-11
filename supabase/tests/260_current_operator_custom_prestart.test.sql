-- Current operator (set by pre-starts) and custom pre-start frequency.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.co@example.test', 'Cal Owner') as owner \gset
select tests.create_user('op1.co@example.test', 'Ola One') as op1 \gset
select tests.create_user('op2.co@example.test', 'Tom Two') as op2 \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Crane Co') as org \gset
reset role;
select tests.add_member(:'org', :'op1', 'driver_operator');
select tests.add_member(:'org', :'op2', 'driver_operator');

insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, created_at) values
  (:'org', 'CR-1', tests.class_id('excavator'), 'Tadano', 'GR', '2026-10-01');
select id as asset from public.assets where asset_number = 'CR-1' \gset

-- Current operator
insert into public.inspections (organisation_id, asset_id, result, submitted_by, submitted_at, header, templates)
values (:'org', :'asset', 'pass', :'op1', '2026-11-02 07:00+10', '{}', '[]');
select is((select current_operator_id from public.assets where id = :'asset'), :'op1'::uuid, 'a pre-start links the equipment to its operator');
insert into public.inspections (organisation_id, asset_id, result, submitted_by, submitted_at, header, templates)
values (:'org', :'asset', 'pass', :'op2', '2026-11-03 07:00+10', '{}', '[]');
select is((select current_operator_id from public.assets where id = :'asset'), :'op2'::uuid, 'another operator''s pre-start moves the link to them');
insert into public.inspections (organisation_id, asset_id, result, submitted_by, submitted_at, header, templates)
values (:'org', :'asset', 'pass', :'op1', '2026-11-01 07:00+10', '{}', '[]');
select is((select current_operator_id from public.assets where id = :'asset'), :'op2'::uuid, 'an older pre-start (sent late) does not move it back');

select tests.authenticate_as(:'owner', 'aal2');
select throws_ok(format($$update public.assets set current_operator_id = %L where id = %L$$, :'owner', :'asset'), '42501', null,
  'nobody can set the operator by hand');
reset role;

-- Custom frequency
select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code(format($$update public.assets set prestart_frequency = 'custom' where id = %L$$, :'asset')), 'asset_invalid',
  'custom needs a number of days');
select lives_ok(format($$update public.assets set prestart_frequency = 'custom', prestart_every_days = 3 where id = %L$$, :'asset'),
  'every 3 days is accepted');
reset role;

-- Last pre-start was Tue 3 Nov. Checking Wed–Thu: within 3 days, nothing missed.
select is(app.detect_missed_prestarts('2026-11-06 02:00+10'), 0, 'Thursday: still within 3 days of the last pre-start');
select is(app.detect_missed_prestarts('2026-11-07 02:00+10'), 1, 'Friday: Wed–Fri had no pre-start, so one is missed');
select is((select frequency::text from public.missed_prestarts where asset_id = :'asset'), 'custom', 'recorded as a custom check');
select is(app.detect_missed_prestarts('2026-11-08 02:00+10'), 0, 'the next day does not record it again');
select is(app.detect_missed_prestarts('2026-11-10 02:00+10'), 1, 'three more days without a pre-start: missed again');

update public.assets set prestart_frequency = 'daily' where id = :'asset';
select is((select prestart_every_days from public.assets where id = :'asset'), null, 'other frequencies clear the days');

select * from finish();
rollback;
