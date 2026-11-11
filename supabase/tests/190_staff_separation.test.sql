-- HVEMS staff accounts and customer memberships are kept apart.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.x@example.test', 'Xena Owner') as owner \gset
select tests.create_user('staff.x@hvems.test', 'Xavier Staff') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'support_agent');

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Xray Plant') as org \gset
reset role;

select is(tests.error_code(format($$select tests.add_member(%L, %L, 'fleet_manager')$$, :'org', :'staff')), 'staff_account',
  'a staff login cannot be added to a company');
select tests.authenticate_as(:'staff', 'aal2');
select is(tests.error_code($$select public.create_organisation('company', 'Staff Side Co')$$), 'staff_account', 'or create one');
reset role;
select is(tests.error_code(format($$insert into public.platform_staff (user_id, role) values (%L, 'support_agent')$$, :'owner')), 'member_account',
  'a company member cannot be made HVEMS staff');

select * from finish();
rollback;
