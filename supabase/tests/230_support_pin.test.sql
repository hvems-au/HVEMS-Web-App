-- Support PIN: shown to Owner and Company Admins, needed by HVEMS support, rotates, locks after 5 wrong.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.p@example.test', 'Pia Owner') as owner \gset
select tests.create_user('admin.p@example.test', 'Pat Admin') as admin \gset
select tests.create_user('fm.p@example.test', 'Phil Fleet') as fm \gset
select tests.create_user('agent.p@hvems.test', 'Pip Agent') as agent \gset
insert into public.platform_staff (user_id, role) values (:'agent', 'support_agent');

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Papa Plant') as org \gset
reset role;
select tests.add_member(:'org', :'admin', 'administrator');
select tests.add_member(:'org', :'fm', 'fleet_manager');

select tests.authenticate_as(:'owner', 'aal2');
select public.my_support_pin(:'org') ->> 'pin' as pin \gset
select ok(:'pin' ~ '^\d{6}$', 'the Owner sees a 6-digit PIN');
select ok((public.my_support_pin(:'org') ->> 'valid_until')::timestamptz > now(), 'with the time it changes');
reset role;
select tests.authenticate_as(:'admin', 'aal2');
select is(public.my_support_pin(:'org') ->> 'pin', :'pin', 'a Company Admin sees the same PIN');
reset role;
select tests.authenticate_as(:'fm', 'aal2');
select is(tests.error_code(format($$select public.my_support_pin(%L)$$, :'org')), 'forbidden', 'a Fleet Manager cannot see it');
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select is(tests.error_code($$select count(*) from public.org_support_pin_secrets$$), '42501', 'the secret cannot be read');
select is(public.start_support_access(:'org', 'Help with the import file', 30, '000000') ->> 'code',
  case when :'pin' = '000000' then null else 'invalid_pin' end, 'a wrong PIN is refused');
reset role;

-- New PIN now.
select tests.authenticate_as(:'owner', 'aal2');
select public.rotate_support_pin(:'org') ->> 'pin' as pin2 \gset
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select is((public.start_support_access(:'org', 'Help with the import file', 30, :'pin') ->> 'ok')::boolean,
  :'pin' = :'pin2', 'after "New PIN now" the old PIN stops working');
select is((public.start_support_access(:'org', 'Help with the import file', 30, :'pin2') ->> 'ok')::boolean, true, 'the new PIN opens a session');
reset role;

-- Lock after 5 wrong PINs (a fresh company, so earlier attempts don't count).
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Papa Two') as org2 \gset
select public.my_support_pin(:'org2') ->> 'pin' as pin3 \gset
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select public.start_support_access(:'org2', 'Help with the import file', 30, 'x') from generate_series(1, 5);
select is(public.start_support_access(:'org2', 'Help with the import file', 30, :'pin3') ->> 'code', 'pin_locked',
  'five wrong PINs lock, even for the right one');
reset role;
select is((select count(*) from public.security_events where organisation_id = :'org2' and event_type = 'support_pin_failed')::int, 5,
  'each wrong PIN is recorded');

select * from finish();
rollback;
