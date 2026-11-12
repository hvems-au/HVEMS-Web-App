-- The testing-only MFA switch: on by default; off relaxes every MFA requirement.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.mfa@example.test', 'Mia Owner') as owner \gset
select tests.create_user('admin.mfa@example.test', 'Max Admin') as admin \gset
select tests.create_user('staff.mfa@example.test', 'Sam Staff') as staff \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Switch Co') as org \gset
reset role;
select tests.add_member(:'org', :'admin', 'administrator');
insert into public.platform_staff (user_id, role) values (:'staff', 'platform_administrator');

select is((select value #>> '{}' from public.platform_settings where key = 'security.mfa_enforced'), 'true', 'MFA is enforced by default');
select ok(app.mfa_required(:'org', :'owner'), 'by default the Owner of a two-member company needs MFA');

select tests.authenticate_as(:'staff');
select ok(not app.is_platform_staff(), 'by default staff without MFA are refused');
reset role;

update public.platform_settings set value = 'false' where key = 'security.mfa_enforced';
select ok(not app.mfa_required(:'org', :'owner'), 'switched off: the Owner does not need MFA');
select tests.authenticate_as(:'staff');
select ok(app.is_platform_staff(), 'switched off: staff are accepted without MFA');
select is((select mfa_satisfied from public.my_staff_context()), true, 'and the console is told MFA is satisfied');
reset role;

select * from finish();
rollback;
