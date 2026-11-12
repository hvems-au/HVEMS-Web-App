-- One person, several roles: permissions are the union; guard rails hold.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.ar@example.test', 'Ann Owner') as owner \gset
select tests.create_user('tech.ar@example.test', 'Tim Tech') as tech \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Roles Co') as org \gset
reset role;
select tests.add_member(:'org', :'tech', 'technician');
select id as tech_m from public.org_memberships where organisation_id = :'org' and user_id = :'tech' \gset
select id as owner_m from public.org_memberships where organisation_id = :'org' and user_id = :'owner' \gset

select tests.authenticate_as(:'tech');
select ok(not ('workforce.manage' = any (public.my_capabilities(:'org'))), 'a technician cannot manage the workforce');
reset role;

select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$select public.set_member_additional_roles(%L, array['fleet_manager']::public.member_role[])$$, :'tech_m'),
  'the Owner gives the technician the Fleet Manager role too');
select is(tests.error_code(format($$select public.set_member_additional_roles(%L, array['owner']::public.member_role[])$$, :'tech_m')),
  'role_not_valid_for_account_type', 'Owner cannot be an additional role');
select is(tests.error_code(format($$select public.set_member_additional_roles(%L, array['technician']::public.member_role[])$$, :'owner_m')),
  'cannot_change_own_role', 'nobody changes their own roles');
reset role;

select tests.authenticate_as(:'tech');
select ok('workforce.manage' = any (public.my_capabilities(:'org')), 'now they have Fleet Manager permissions');
select ok('work_orders.work' = any (public.my_capabilities(:'org')), 'and keep their technician permissions');
select is(tests.error_code(format($$select public.set_member_additional_roles(%L, '{}')$$, :'tech_m')),
  'forbidden', 'and still cannot change roles themselves');
reset role;

select ok(exists (select 1 from app.alert_recipients(:'org', false) r where r = :'tech'), 'they receive Fleet Manager alerts');
update public.org_memberships set role = 'fleet_manager' where id = :'tech_m';
select is((select additional_roles from public.org_memberships where id = :'tech_m'), '{}'::public.member_role[],
  'a main role is never also listed as an additional role');

select * from finish();
rollback;
