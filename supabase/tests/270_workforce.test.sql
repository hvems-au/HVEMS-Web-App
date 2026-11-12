-- Workforce: profiles, qualifications, leave and allocation warnings.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.wf@example.test', 'Wes Owner') as owner \gset
select tests.create_user('fm.wf@example.test', 'Fay Fleet') as fm \gset
select tests.create_user('tech.wf@example.test', 'Tim Tech') as tech \gset
select tests.create_user('other.wf@example.test', 'Ola Other') as other \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Wombat Works') as org \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');
select tests.add_member(:'org', :'tech', 'technician');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values
  (:'org', 'EX-1', tests.class_id('excavator'), 'CAT', '320');
select id as asset from public.assets where asset_number = 'EX-1' and organisation_id = :'org' \gset

-- A Fleet Manager records the technician's profile, qualifications and leave.
select tests.authenticate_as(:'fm', 'aal2');
select lives_ok(format($$insert into public.workforce_profiles (organisation_id, user_id, trade) values (%L, %L, 'Diesel fitter')$$, :'org', :'tech'),
  'a Fleet Manager adds a technician profile');
select lives_ok(format($$insert into public.workforce_qualifications (organisation_id, user_id, kind, label, expires_on) values (%L, %L, 'licence', 'HR', '2026-11-01')$$, :'org', :'tech'),
  'and a qualification');
select lives_ok(format($$insert into public.workforce_leave (organisation_id, user_id, kind, starts_on, ends_on) values (%L, %L, 'annual', '2026-12-01', '2026-12-05')$$, :'org', :'tech'),
  'and leave');
select throws_ok(format($$insert into public.workforce_leave (organisation_id, user_id, kind, starts_on, ends_on) values (%L, %L, 'annual', '2026-12-05', '2026-12-01')$$, :'org', :'tech'),
  '23514', null, 'leave must end on or after it starts');
select throws_ok(format($$insert into public.workforce_profiles (organisation_id, user_id) values (%L, %L)$$, :'org', :'other'),
  '23503', null, 'only members of the company can have a profile');
reset role;

-- The technician sees their own records but can't change them.
select tests.authenticate_as(:'tech');
select is((select count(*) from public.workforce_qualifications)::int, 1, 'a technician sees their own qualifications');
select throws_ok(format($$insert into public.workforce_leave (organisation_id, user_id, kind, starts_on, ends_on) values (%L, %L, 'sick', '2026-12-10', '2026-12-10')$$, :'org', :'tech'),
  '42501', null, 'but cannot record leave');
select is(tests.error_code(format($$select public.allocation_warnings(%L, %L)$$, :'org', :'tech')), 'forbidden', 'or preview warnings');
reset role;

-- Allocation warnings are recorded on the work order and never block.
select tests.authenticate_as(:'fm', 'aal2');
select public.create_work_order(:'org', :'asset', 'Replace hydraulic hose', null, 'internal', null, 'normal', :'tech', '2026-12-03') as wo \gset
select id as wo_id from public.work_orders where organisation_id = :'org' and title = 'Replace hydraulic hose' \gset
select is((select jsonb_path_query_array(assignment_warnings, '$[*].code') from public.work_orders where id = :'wo_id'), '["on_leave"]'::jsonb,
  'assigning someone on leave on the due date is allowed, with a warning');
select is((public.set_work_order_requirement(:'wo_id', 'licence') -> 1 ->> 'message'), 'Licence expired on 01/11/2026',
  'a required qualification that has expired is flagged');
select is((public.set_work_order_requirement(:'wo_id', 'first_aid') -> 1 ->> 'message'), 'No first aid recorded',
  'a missing one too');
select ok(public.update_work_order(:'wo_id', 'Replace hydraulic hose', null, 'internal', null, 'normal', :'tech', '2026-12-08') is null or true, 'move the due date');
select is((select jsonb_path_query_array(assignment_warnings, '$[*].code') from public.work_orders where id = :'wo_id'), '["no_qualification"]'::jsonb,
  'after the leave, only the qualification warning is left');
select lives_ok(format($$select public.cancel_leave(id) from public.workforce_leave where user_id = %L$$, :'tech'), 'leave can be cancelled');
select is((select count(*) from public.workforce_leave where user_id = :'tech' and cancelled_at is not null)::int, 1, 'and is kept in the history');
reset role;

select ok(exists (select 1 from public.audit_events where entity_type = 'workforce_qualifications'), 'qualification changes are audited');

-- Expiry alerts (relative to the day the test runs)
insert into public.workforce_qualifications (organisation_id, user_id, kind, label, expires_on)
values (:'org', :'tech', 'induction', 'Site A', current_date - 3);
select cmp_ok(app.notify_qualification_expiry(), '>=', 1, 'expired qualifications raise an alert');
select is((select count(*) from public.notifications where organisation_id = :'org' and kind = 'credential_expired'
  and recipient_id = :'fm' and title like '%Induction (Site A)%')::int, 1, 'Fleet Managers are told once');
select is(app.notify_qualification_expiry(), 0, 'and not again');

select * from finish();
rollback;
