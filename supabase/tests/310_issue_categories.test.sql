-- Issue categories on operator reports.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.ic@example.test', 'Ivy Owner') as owner \gset
select tests.create_user('op.ic@example.test', 'Ian Operator') as op \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Category Co') as org \gset
reset role;
select tests.add_member(:'org', :'op', 'driver_operator');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values
  (:'org', 'TRK-1', tests.class_id('excavator'), 'Isuzu', 'FVZ');
select id as a1 from public.assets where asset_number = 'TRK-1' \gset

select tests.authenticate_as(:'op');
select (public.submit_issue_report('tyres', :'a1', 'Front left tyre low', null, 'not_urgent') ->> 'defect_id') as d1 \gset
select is(tests.error_code(format($$select public.submit_issue_report('teleport', %L, 'Odd noise', null, 'soon')$$, :'a1')), 'category_required',
  'an unknown category is refused');
select is(tests.error_code(format($$select public.submit_issue_report(null, %L, 'Odd noise', null, 'soon')$$, :'a1')), 'category_required',
  'a category is required');
select (public.report_issue(:'a1', 'Mirror cracked', null, 'not_urgent') ->> 'defect_id') as d2 \gset
reset role;

select is((select issue_category from public.defects where id = :'d1'), 'tyres', 'the category is stored on the defect');
select is((select severity::text from public.defects where id = :'d1'), 'advisory', 'the category does not change severity; urgency does');
select is((select issue_category from public.defects where id = :'d2'), 'other', 'the original report call files under other');
select throws_ok(format($$update public.defects set issue_category = 'nonsense' where id = %L$$, :'d1'), '23514', null,
  'the column only accepts known categories');

select * from finish();
rollback;
