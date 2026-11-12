-- Operator workspace: company-wide equipment, direct PIN sign-in, issue reports.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.ow@example.test', 'Olive Owner') as owner \gset
select tests.create_user('op.ow@example.test', 'Oscar Operator') as op \gset
select tests.create_user('other.ow@example.test', 'Otto Other') as other \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Quarry Co') as org \gset
reset role;
select tests.authenticate_as(:'other');
select public.create_organisation('company', 'Elsewhere Pty') as org2 \gset
reset role;
select tests.add_member(:'org', :'op', 'driver_operator');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values
  (:'org', 'LDR-1', tests.class_id('excavator'), 'CAT', '950'),
  (:'org', 'LDR-2', tests.class_id('excavator'), 'CAT', '966'),
  (:'org2', 'X-1', tests.class_id('excavator'), 'CAT', '320');
select id as a1 from public.assets where asset_number = 'LDR-1' \gset
select id as x1 from public.assets where asset_number = 'X-1' \gset

select isnt((select operator_code from public.organisations where id = :'org'), null, 'companies get a company code');

-- Company-wide equipment (default) and the stricter per-operator option
select tests.authenticate_as(:'op');
select is((select count(*) from public.assets)::int, 2, 'an operator sees all equipment of their company, none of others');
reset role;
update public.organisations set operators_any_equipment = false where id = :'org';
select tests.authenticate_as(:'op');
select is((select count(*) from public.assets)::int, 0, 'with per-operator access and nothing ticked, they see none');
reset role;
update public.organisations set operators_any_equipment = true where id = :'org';

-- Issue reports
select tests.authenticate_as(:'op');
select (public.report_issue(:'a1', 'Hydraulic leak', 'Dripping under the boom', 'stop', '{}', '11111111-1111-1111-1111-111111111111') ->> 'defect_id') as d1 \gset
select is((public.report_issue(:'a1', 'Hydraulic leak', 'Dripping under the boom', 'stop', '{}', '11111111-1111-1111-1111-111111111111') ->> 'defect_id'),
  :'d1', 'a retried report returns the same record');
select is(tests.error_code(format($$select public.report_issue(%L, 'Leak', null, 'soon')$$, :'x1')), 'forbidden',
  'they cannot report on another company''s equipment');
select is(tests.error_code(format($$select public.clear_defect(%L, 'fixed', null, '{}')$$, :'d1')), 'forbidden',
  'reporting does not let them clear it');
reset role;
select is((select severity::text || '/' || source || '/' || reported_urgency from public.defects where id = :'d1'), 'critical/operator_report/stop',
  '"stop using it" is recorded as a critical operator report');
select is((select condition::text from public.assets where id = :'a1'), 'out_of_service', 'the equipment goes out of service');
select ok(exists (select 1 from public.critical_alerts where source_type = 'defect' and source_id = :'d1'), 'and a critical alert is raised');

-- Operators keep seeing what they reported even if access is narrowed
update public.organisations set operators_any_equipment = false where id = :'org';
select tests.authenticate_as(:'op');
select is((select count(*) from public.defects where reported_by = :'op')::int, 1, 'they still see their own reports');
reset role;

select * from finish();
rollback;
