-- Pre-start inspections (P-01 draft content): checklist by class, every answer
-- checked, Critical faults take equipment out of service, operator faults
-- don't touch the equipment, managers notified, records immutable.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.p@example.test', 'Pia Owner') as owner \gset
select tests.create_user('fm.p@example.test', 'Fred Fleet') as fm \gset
select tests.create_user('driver.p@example.test', 'Dan Driver') as driver \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Papa Plant') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
  values (:'org', 'EX-P1', tests.class_id('excavator'), 'CAT', '320', 'SNP1', 'hours') returning id as ex \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'driver', 'driver_operator') as driver_m \gset

-- All OK except the listed fault (code => note).
create function pg_temp.answers(p_asset uuid, p_fault text default null, p_note text default 'Broken') returns jsonb
language sql as $$
  select jsonb_agg(jsonb_build_object('item_code', e ->> 'item_code',
    'answer', case when e ->> 'item_code' = p_fault then 'fault' else 'ok' end,
    'note', case when e ->> 'item_code' = p_fault then p_note end))
  from jsonb_array_elements(public.prestart_checklist(p_asset)) e
$$;

select tests.authenticate_as(:'owner');
select is(jsonb_array_length(public.prestart_checklist(:'ex')), 52, 'an excavator gets safety (21), general (20) and excavator (11) items');
select is(tests.error_code(format($$select public.submit_prestart(%L, '[]'::jsonb, null, 100, null, '[]', true)$$, :'ex')), 'checklist_incomplete',
  'every item must be answered');
select is(tests.error_code(format($$select public.submit_prestart(%L, pg_temp.answers(%L, 'EX-09', ''), null, 100, null, '[]', true)$$, :'ex', :'ex')),
  'checklist_incomplete', 'a fault needs a note');
select is(tests.error_code(format($$select public.submit_prestart(%L, pg_temp.answers(%L), null, null, null, '[]', true)$$, :'ex', :'ex')),
  'checklist_incomplete', 'the hour meter must be read');
select is(tests.error_code(format($$select public.submit_prestart(%L, pg_temp.answers(%L), null, 100, null, '[]', false)$$, :'ex', :'ex')),
  'declaration_required', 'the declaration must be ticked');
select is(tests.error_code(format($$select public.submit_prestart(%L,
  (select jsonb_agg(case when x ->> 'item_code' = 'S-05' then x || '{"answer":"na"}' else x end) from jsonb_array_elements(pg_temp.answers(%L)) x),
  null, 100, null, '[]', true)$$, :'ex', :'ex')), 'checklist_incomplete', 'N/A is refused where not allowed');

-- A clean pass.
select is((public.submit_prestart(:'ex', pg_temp.answers(:'ex'), null, 100, null, '[]', true) ->> 'result'), 'pass', 'all OK passes');
select is((select condition::text from public.assets where id = :'ex'), 'active', 'a pass leaves the excavator Active');
reset role;

-- Drivers only on permitted equipment.
select tests.authenticate_as(:'driver');
select is(tests.error_code(format($$select public.prestart_checklist(%L)$$, :'ex')), 'forbidden', 'a driver not permitted on the machine is refused');
reset role;
insert into public.asset_operator_permissions (organisation_id, membership_id, asset_id) values (:'org', :'driver_m', :'ex');

-- Operator not fit: fails, but the equipment is untouched.
select tests.authenticate_as(:'driver');
select public.submit_prestart(:'ex', pg_temp.answers(:'ex', 'S-01', 'Very tired'), null, 110, null, '[]', true, gen_random_uuid(), true) as r1 \gset
select is((:'r1'::jsonb ->> 'result'), 'fail', 'an operator who is not fit fails the pre-start');
select is((select count(*)::int from public.defects where asset_id = :'ex'), 0, 'no defect is raised for the operator');
select is((select condition::text from public.assets where id = :'ex'), 'active', 'the equipment stays Active');

-- Critical fault: out of service, defect, managers told.
select gen_random_uuid() as req \gset
select public.submit_prestart(:'ex', pg_temp.answers(:'ex', 'EX-01', 'Quick hitch pin missing'), null, 120, null, '[]', true, :'req', true) as r2 \gset
select is((:'r2'::jsonb ->> 'result'), 'fail', 'a critical fault fails the pre-start');
select is((select condition::text from public.assets where id = :'ex'), 'out_of_service', 'the excavator is Out of service');
select is((select severity::text from public.defects where asset_id = :'ex' and item_code = 'EX-01'), 'critical', 'a Critical defect is raised');
select is((public.submit_prestart(:'ex', pg_temp.answers(:'ex', 'EX-01', 'Quick hitch pin missing'), null, 120, null, '[]', true, :'req') ->> 'duplicate')::boolean,
  true, 'a retry with the same request id returns the first pre-start');
select is((select count(*)::int from public.notifications), 0, 'the driver gets no manager alerts');
select is(tests.error_code(format($$update public.inspections set result = 'pass' where id = %L$$, :'r2'::jsonb ->> 'inspection_id')), '42501',
  'a submitted pre-start cannot be changed');
reset role;

select tests.authenticate_as(:'owner');
select is((select count(*)::int from public.notifications where kind = 'critical_defect'), 1, 'the Owner is alerted');
select is((public.submit_prestart(:'ex', pg_temp.answers(:'ex', 'EX-01', 'Still missing'), null, 130, null, '[]', true, null, true) ->> 'result'), 'fail',
  'the same fault again still fails');
select is((select count(*)::int from public.defects where asset_id = :'ex' and item_code = 'EX-01'), 1, 'but no duplicate defect is raised');
reset role;

select tests.authenticate_as(:'fm');
select ok((select count(*)::int from public.notifications where kind = 'critical_defect') >= 1, 'the Fleet Manager is alerted');
select ok(public.mark_notifications_read() >= 1, 'alerts can be marked read');
select is((select count(*)::int from public.notifications where read_at is null), 0, 'nothing unread afterwards');
reset role;

select * from finish();
rollback;
