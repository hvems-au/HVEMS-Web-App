-- MFA recovery codes, Owner/Admin MFA reset and the "MFA for everyone" setting.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.m@example.test', 'Mia Owner') as owner \gset
select tests.create_user('admin.m@example.test', 'Max Admin') as admin \gset
select tests.create_user('fm.m@example.test', 'Fay Fleet') as fm \gset
select tests.create_user('drv.m@example.test', 'Dom Driver') as drv \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Mike Haulage') as org \gset
reset role;
select tests.add_member(:'org', :'admin', 'administrator') as admin_m \gset
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'drv', 'driver_operator') as drv_m \gset
insert into public.driver_profiles (organisation_id, driver_number, full_name, user_id, membership_id)
values (:'org', 1, 'Dom Driver', :'drv', :'drv_m');
select id as owner_m from public.org_memberships where organisation_id = :'org' and user_id = :'owner' \gset

-- Recovery codes ---------------------------------------------------------------
select tests.authenticate_as(:'owner');
select is(tests.error_code($$select public.generate_mfa_recovery_codes()$$), 'mfa_required', 'creating codes needs an MFA session');
select tests.authenticate_as(:'owner', 'aal2');
select public.generate_mfa_recovery_codes() as codes \gset
select is(cardinality(:'codes'::text[]), 10, 'ten codes are issued');
select is((select count(distinct c) from unnest(:'codes'::text[]) c)::int, 10, 'the codes are all different');
select ok((select bool_and(c ~ '^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$') from unnest(:'codes'::text[]) c), 'codes avoid look-alike characters');
select is((public.my_mfa_recovery_status() ->> 'remaining')::int, 10, 'ten codes remain');
select is(tests.error_code($$select count(*) from public.mfa_recovery_codes$$), '42501', 'the hashes cannot be read directly');

select tests.authenticate_as(:'owner');
select is((public.use_mfa_recovery_code('AAAAA-AAAAA') ->> 'code'), 'invalid_recovery_code', 'a wrong code is refused');
select is((public.use_mfa_recovery_code(lower(replace((:'codes'::text[])[1], '-', ' '))) ->> 'ok')::boolean, true,
  'a right code works, whatever the case or spacing');
select is((public.use_mfa_recovery_code((:'codes'::text[])[1]) ->> 'code'), 'invalid_recovery_code', 'each code works only once');
select is((public.my_mfa_recovery_status() ->> 'remaining')::int, 9, 'nine codes remain');

select public.use_mfa_recovery_code('BBBBB-BBBBB') from generate_series(1, 4);
select is((public.use_mfa_recovery_code((:'codes'::text[])[2]) ->> 'code'), 'recovery_locked', 'five wrong codes lock recovery, even for a right code');
reset role;
select is((select count(*) from public.security_events where user_id = :'owner' and event_type = 'mfa_recovery_code_failed')::int, 6,
  'each wrong code is recorded');

-- A new set replaces the old one.
select tests.authenticate_as(:'owner', 'aal2');
select public.generate_mfa_recovery_codes() as codes2 \gset
reset role;
select tests.authenticate_as(:'admin');
select is((public.my_mfa_recovery_status() ->> 'remaining')::int, 0, 'someone else''s codes are not counted as yours');
reset role;
select is((select count(*) from public.mfa_recovery_codes where user_id = :'owner')::int, 10, 'creating a new set replaces the old one');

-- Resets -----------------------------------------------------------------------
select tests.authenticate_as(:'fm', 'aal2');
select public.generate_mfa_recovery_codes() is not null as fm_codes \gset
select is(tests.error_code(format($$select public.reset_member_mfa(%L, 'Lost phone')$$, :'admin_m')), 'forbidden', 'a Fleet Manager cannot reset MFA');

select tests.authenticate_as(:'admin');
select is(tests.error_code(format($$select public.reset_member_mfa(%L, 'Lost phone')$$, :'fm_m')), 'mfa_required', 'resetting needs your own MFA session');
select tests.authenticate_as(:'admin', 'aal2');
select is(tests.error_code(format($$select public.reset_member_mfa(%L, '')$$, :'fm_m')), 'reason_required', 'a reason is required');
select is(tests.error_code(format($$select public.reset_member_mfa(%L, 'Lost phone')$$, :'admin_m')), 'cannot_reset_own_mfa', 'you cannot reset your own');
select is(tests.error_code(format($$select public.reset_member_mfa(%L, 'Lost phone')$$, :'owner_m')), 'cannot_reset_owner_mfa', 'a Company Admin cannot reset the Owner');
select is(tests.error_code(format($$select public.reset_member_mfa(%L, 'Lost phone')$$, :'drv_m')), 'driver_profile', 'drivers use a PIN reset instead');
select is(public.reset_member_mfa(:'fm_m', 'Lost phone'), :'fm'::uuid, 'a Company Admin resets a member and gets their user id');
reset role;
select is((select count(*) from public.mfa_recovery_codes where user_id = :'fm')::int, 0, 'the member''s old recovery codes are cancelled');
select is((select count(*) from public.security_events where organisation_id = :'org' and event_type = 'member_mfa_reset')::int, 1, 'the reset is recorded');

select tests.authenticate_as(:'owner', 'aal2');
select is(public.reset_member_mfa(:'admin_m', 'New phone'), :'admin'::uuid, 'the Owner can reset a Company Admin');
select is(tests.error_code(format($$select public.admin_reset_user_mfa(%L, 'Called them back on file number')$$, :'fm')), 'forbidden',
  'only a Super Admin can use the console reset');

-- MFA for everyone (O-06) ------------------------------------------------------
reset role;
select is(app.mfa_required(:'org', :'fm'), false, 'off: a Fleet Manager does not need MFA');
update public.platform_settings set value = 'true' where key = 'security.mfa_required_for_all';
select is(app.mfa_required(:'org', :'fm'), true, 'on: every member needs MFA');
select is(app.mfa_required(:'org', :'drv'), false, 'on: Driver ID + PIN profiles are still not member logins');

select * from finish();
rollback;
