-- Sign-in and security events: Super Admin only.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.q@example.test', 'Quinn Owner') as owner \gset
select tests.create_user('agent.q@hvems.test', 'Quin Agent') as agent \gset
select tests.create_user('admin.q@hvems.test', 'Quade Admin') as admin \gset
insert into public.platform_staff (user_id, role) values (:'agent', 'support_agent'), (:'admin', 'platform_administrator');

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Quebec Quarry') as org \gset
reset role;
select app.security_event('password_sign_in_failed', :'org', '{}'::jsonb, :'owner');

select tests.authenticate_as(:'owner', 'aal2');
select is((select count(*) from public.security_events)::int, 0, 'the company Owner cannot see security events');
reset role;
select tests.authenticate_as(:'agent', 'aal2');
select is((select count(*) from public.security_events)::int, 0, 'a Support Agent cannot either');
reset role;
select tests.authenticate_as(:'admin');
select is((select count(*) from public.security_events)::int, 0, 'the Super Admin needs an MFA session');
reset role;
select tests.authenticate_as(:'admin', 'aal2');
select ok((select count(*) from public.security_events where organisation_id = :'org') >= 1, 'the Super Admin sees them');
reset role;

select * from finish();
rollback;
