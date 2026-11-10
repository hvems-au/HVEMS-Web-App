-- Decision O-05: the Super Admin (Platform Administrator with MFA) can read
-- every organisation's fleet records; Support Agents and staff without MFA can't.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.f@example.test', 'Fay Owner') as owner \gset
select tests.create_user('admin@hvems.test', 'Ada Admin') as admin \gset
select tests.create_user('agent@hvems.test', 'Sid Support') as agent \gset
insert into public.platform_staff (user_id, role) values (:'admin', 'platform_administrator'), (:'agent', 'support_agent');

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Foxtrot Plant') as org \gset
insert into public.clients (organisation_id, name) values (:'org', 'Golf Civil');
insert into public.sites (organisation_id, name) values (:'org', 'Hotel Depot');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (:'org', 'EX-9', tests.class_id('excavator'), 'CAT', '320', 'SN9');
reset role;

select tests.authenticate_as(:'admin', 'aal2');
select is((select count(*)::int from public.assets where organisation_id = :'org'), 1, 'Super Admin with MFA sees the equipment');
select is((select count(*)::int from public.clients where organisation_id = :'org'), 1, 'Super Admin with MFA sees the clients');
select is((select count(*)::int from public.sites where organisation_id = :'org'), 1, 'Super Admin with MFA sees the sites');
select is(tests.error_code(format($$update public.assets set make = 'X' where organisation_id = %L$$, :'org')), null,
  'an update runs but changes nothing (read-only access)');
reset role;
select is((select make from public.assets where asset_number = 'EX-9'), 'CAT', 'Super Admin access is read-only');

select tests.authenticate_as(:'admin', 'aal1');
select is((select count(*)::int from public.assets where organisation_id = :'org'), 0, 'without MFA the Super Admin sees nothing');
reset role;

select tests.authenticate_as(:'agent', 'aal2');
select is((select count(*)::int from public.assets where organisation_id = :'org'), 0, 'Support Agents still need support access');
reset role;

select * from finish();
rollback;
