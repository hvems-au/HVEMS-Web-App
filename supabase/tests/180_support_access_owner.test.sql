-- Support access: 60-minute limit, read-only, Owner notified and can end it.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.s@example.test', 'Sam Owner') as owner \gset
select tests.create_user('fm.s@example.test', 'Fay Fleet') as fm \gset
select tests.create_user('agent.s@hvems.test', 'Ash Agent') as agent \gset
insert into public.platform_staff (user_id, role) values (:'agent', 'support_agent');

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Sierra Haulage') as org \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
values (:'org', 'S-001', tests.class_id('excavator'), 'CAT', '320', 'SER-S-1') returning id as asset \gset

select tests.authenticate_as(:'owner');
select public.my_support_pin(:'org') ->> 'pin' as pin \gset
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select is((select count(*) from public.assets where organisation_id = :'org')::int, 0, 'no support session: no fleet records');
select is(tests.error_code(format($$select public.start_support_access(%L, 'Help with the import file', 61, '000000')$, :'org')), 'invalid_duration',
  'sessions are limited to 60 minutes');
select is(tests.error_code(format($$select public.start_support_access(%L, 'short', 30, '000000')$, :'org')), 'reason_required', 'a reason is needed');
select public.start_support_access(:'org', 'Help with the import file', 30, :'pin') ->> 'grant_id' as grant_id \gset
select is(tests.error_code(format($$select public.start_support_access(%L, 'Help with the import file', 30, %L)$, :'org', :'pin')), 'already_active',
  'one session at a time');
select is((select count(*) from public.assets where organisation_id = :'org')::int, 1, 'during the session the fleet is visible');
select tests.error_code(format($$update public.assets set make = 'Changed by support' where id = %L$$, :'asset'));
reset role;
select is((select make from public.assets where id = :'asset'), 'CAT', 'support access is read-only');

select is((select count(*) from public.notifications where organisation_id = :'org' and kind = 'support_access_started' and recipient_id = :'owner')::int, 1,
  'the Owner is notified');
select is((select count(*) from public.notifications where organisation_id = :'org' and kind = 'support_access_started' and recipient_id = :'fm')::int, 0,
  'a Fleet Manager is not');

select tests.authenticate_as(:'fm', 'aal2');
select is(tests.error_code(format($$select public.owner_end_support_access(%L)$$, :'grant_id')), 'forbidden', 'a Fleet Manager cannot end it');
reset role;
select tests.authenticate_as(:'owner', 'aal2');
select is((select count(*) from public.support_access_grants where organisation_id = :'org')::int, 1, 'the Owner sees the session');
select lives_ok(format($$select public.owner_end_support_access(%L)$$, :'grant_id'), 'the Owner ends it');
reset role;
select is((select ended_by from public.support_access_grants where id = :'grant_id'), :'owner'::uuid, 'who ended it is recorded');
select tests.authenticate_as(:'agent', 'aal2');
select is((select count(*) from public.assets where organisation_id = :'org')::int, 0, 'after the Owner ends it, the records are hidden again');
reset role;

select * from finish();
rollback;
