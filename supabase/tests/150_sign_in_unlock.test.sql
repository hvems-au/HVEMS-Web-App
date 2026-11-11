-- O-11: the Owner / Company Admin unlocks a member's sign-in; the Super Admin unlocks anyone.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.u@example.test', 'Una Owner') as owner \gset
select tests.create_user('admin.u@example.test', 'Ari Admin') as admin \gset
select tests.create_user('fm.u@example.test', 'Fin Fleet') as fm \gset
select tests.create_user('out.u@example.test', 'Oz Outsider') as outsider \gset
select tests.create_user('staff.u@hvems.test', 'Sue Staff') as staff \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Uniform Plant') as org \gset
reset role;
select tests.add_member(:'org', :'admin', 'administrator') as admin_m \gset
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'platform_administrator');

-- The Fleet Manager gets locked out.
select public.record_password_sign_in('fm.u@example.test', false) from generate_series(1, 5);
select is((public.password_sign_in_status('fm.u@example.test') ->> 'locked')::boolean, true, 'the Fleet Manager is locked');

reset role;
select tests.authenticate_as(:'admin', 'aal2');
select is((select count(*) from public.member_sign_in_locks(:'org') where membership_id = :'fm_m' and locked_until is not null)::int, 1,
  'a Company Admin sees the lock on the Team page');
reset role;
select tests.authenticate_as(:'outsider', 'aal2');
select is((select count(*) from public.member_sign_in_locks(:'org'))::int, 0, 'outsiders see nothing');
select is(tests.error_code(format($$select public.unlock_member_sign_in(%L)$$, :'fm_m')), 'forbidden', 'outsiders cannot unlock');
reset role;
select tests.authenticate_as(:'fm', 'aal2');
select is(tests.error_code(format($$select public.unlock_member_sign_in(%L)$$, :'admin_m')), 'forbidden', 'a Fleet Manager cannot unlock others');
reset role;
select tests.authenticate_as(:'admin', 'aal2');
select lives_ok(format($$select public.unlock_member_sign_in(%L)$$, :'fm_m'), 'a Company Admin unlocks the member');
reset role;
select is((public.password_sign_in_status('fm.u@example.test') ->> 'locked')::boolean, false, 'the member can sign in again');
select is((select count(*) from public.security_events where organisation_id = :'org' and event_type = 'sign_in_unlocked')::int, 1, 'the unlock is recorded');

-- Super Admin, any account (here the Owner).
select public.record_password_sign_in('owner.u@example.test', false) from generate_series(1, 5);
select tests.authenticate_as(:'admin', 'aal2');
select is(tests.error_code(format($$select public.admin_unlock_sign_in(%L)$$, :'owner')), 'forbidden', 'only HVEMS can use the console unlock');
reset role;
select tests.authenticate_as(:'staff');
select is(tests.error_code(format($$select public.admin_unlock_sign_in(%L)$$, :'owner')), 'forbidden', 'the Super Admin needs an MFA session');
reset role;
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(format($$select public.admin_unlock_sign_in(%L)$$, :'owner'), 'the Super Admin unlocks the Owner');
reset role;
select is((public.password_sign_in_status('owner.u@example.test') ->> 'locked')::boolean, false, 'the Owner can sign in again');
select is((select count(*) from public.security_events where organisation_id = :'org' and event_type = 'hvems_staff_sign_in_unlocked')::int, 1,
  'the company sees that HVEMS unlocked its Owner');

select * from finish();
rollback;
