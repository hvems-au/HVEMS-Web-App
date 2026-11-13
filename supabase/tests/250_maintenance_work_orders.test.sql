-- 2C slice 1: service plans, schedule, overdue condition, work orders.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.w@example.test', 'Wendy Owner') as owner \gset
select tests.create_user('tech.w@example.test', 'Tom Tech') as tech \gset
select tests.create_user('drv.w@example.test', 'Dee Driver') as drv \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Whiskey Works') as org \gset
reset role;
select tests.add_member(:'org', :'tech', 'technician');
select tests.add_member(:'org', :'drv', 'driver_operator');
update public.organisations set settings = settings || '{"overdue_service_sets_needs_attention": true}' where id = :'org';
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, meter_type)
values (:'org', 'EX-9', tests.class_id('excavator'), 'CAT', '320', 'hours') returning id as asset \gset
insert into public.meter_readings (organisation_id, asset_id, unit, value, status, identification_method)
values (:'org', :'asset', 'hours', 980, 'accepted', 'system');

-- Plans
select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$insert into public.service_plans (organisation_id, asset_id, name, interval_hours, last_done_hours)
  values (%L, %L, '250-hour service', 250, 750)$$, :'org', :'asset'), 'the Owner adds an hours-based plan');
select lives_ok(format($$insert into public.service_plans (organisation_id, asset_id, name, interval_days, last_done_on)
  values (%L, %L, 'Annual inspection', 365, current_date - 300)$$, :'org', :'asset'), 'and a date-based plan');
select is(tests.error_code(format($$insert into public.service_plans (organisation_id, asset_id, name) values (%L, %L, 'No interval')$$, :'org', :'asset')),
  '23514', 'a plan needs an interval');
select is((select status from public.service_schedule where name = '250-hour service'), 'due_soon', '980 h with 1000 h due: due soon');
select is((select status from public.service_schedule where name = 'Annual inspection'), 'ok', '65 days to go: OK');
select is((select next_due_hours from public.service_schedule where name = '250-hour service'), 1000.0, 'next due at 1000 hours');
reset role;

insert into public.meter_readings (organisation_id, asset_id, unit, value, status, identification_method, read_at)
values (:'org', :'asset', 'hours', 1010, 'accepted', 'system', now() + interval '1 second');
select ok(app.sync_overdue_services(:'org') >= 1, 'the hourly sync notices the overdue plan');
select is((select condition::text from public.assets where id = :'asset'), 'needs_attention', 'overdue service: Needs attention (company rule on)');

select tests.authenticate_as(:'tech');
select is(tests.error_code(format($$insert into public.service_plans (organisation_id, asset_id, name, interval_days) values (%L, %L, 'Tech plan', 30)$$,
  :'org', :'asset')), '42501', 'a technician cannot add plans');
select is((select count(*) from public.service_schedule)::int, 2, 'but sees the schedule');
reset role;
select tests.authenticate_as(:'drv');
select is((select count(*) from public.service_schedule)::int, 0, 'drivers do not see it');
reset role;

-- Work order for the overdue service
select id as plan from public.service_plans where name = '250-hour service' \gset
select tests.authenticate_as(:'owner', 'aal2');
select public.create_work_order(:'org', :'asset', '250-hour service', null, 'internal', null, 'high', :'tech', current_date + 2, :'plan') as wo \gset
select is((:'wo'::jsonb ->> 'number')::int, 1, 'work orders are numbered from 1');
select is(tests.error_code(format($$select public.create_work_order(%L, %L, 'Vendor job', null, 'vendor')$$, :'org', :'asset')), '23514',
  'a vendor work order needs the vendor''s name');
select is(tests.error_code(format($$select public.create_work_order(%L, %L, 'Bad assignee', null, 'internal', null, 'normal', %L)$$, :'org', :'asset', :'owner')),
  null, 'assigning to a member works');
reset role;
select tests.authenticate_as(:'drv');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'start')$$, :'wo'::jsonb ->> 'id')), 'forbidden', 'drivers cannot work on it');
reset role;
select tests.authenticate_as(:'tech');
select lives_ok(format($$select public.update_work_order_status(%L, 'start')$$, :'wo'::jsonb ->> 'id'), 'the technician starts it');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'complete', 'Oil done')$$, :'wo'::jsonb ->> 'id')), 'reports_required',
  'a technician needs the pre-work and post-work reports first');
select lives_ok(format($$select public.submit_work_order_report(%L, 'pre', 'Leaking oil seal, otherwise good')$$, :'wo'::jsonb ->> 'id'), 'pre-work report');
select lives_ok(format($$select public.submit_work_order_report(%L, 'post', 'Oil, filters and greasing done')$$, :'wo'::jsonb ->> 'id'), 'post-work report');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'complete', '')$$, :'wo'::jsonb ->> 'id')), 'notes_required', 'completing needs notes');
select lives_ok(format($$select public.update_work_order_status(%L, 'complete', 'Oil, filters and greasing done', null, 1012, 3.5, 48000)$$, :'wo'::jsonb ->> 'id'),
  'and completes it with hours, labour and cost');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'close')$$, :'wo'::jsonb ->> 'id')), 'forbidden', 'a technician cannot close it');
reset role;
select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$select public.update_work_order_status(%L, 'close', 'Checked')$$, :'wo'::jsonb ->> 'id'), 'the Owner reviews and closes it');
reset role;
select is((select last_done_hours from public.service_plans where id = :'plan'), 1012.0, 'closing records the service at 1012 hours');
select is((select status from public.service_schedule where id = :'plan'), 'ok', 'the plan is OK again');
select is((select condition::text from public.assets where id = :'asset'), 'active', 'and the equipment is Active again');

select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'reopen')$$, :'wo'::jsonb ->> 'id')), 'reason_required', 'reopening needs a reason');
select lives_ok(format($$select public.update_work_order_status(%L, 'reopen', 'Oil leak found next day')$$, :'wo'::jsonb ->> 'id'), 'it can be reopened');
select is((select status || '/' || reopen_count from public.work_orders where id = (:'wo'::jsonb ->> 'id')::uuid), 'in_progress/1', 'back in progress, counted');
select lives_ok(format($$select public.update_work_order_status(%L, 'cancel', 'Raised twice')$$, :'wo'::jsonb ->> 'id'), 'or cancelled with a reason');
reset role;
select ok(exists (select 1 from public.audit_events where entity_type = 'work_orders' and action = 'update'), 'work order changes are audited');

select * from finish();
rollback;
