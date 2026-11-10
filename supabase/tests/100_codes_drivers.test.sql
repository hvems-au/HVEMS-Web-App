-- Equipment QR codes and driver profiles with PIN sign-in (O-10).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.s@example.test', 'Sia Owner') as owner \gset
select tests.create_user('tech.s@example.test', 'Ted Tech') as tech \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Sierra Civil') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
  values (:'org', 'EX-S1', tests.class_id('excavator'), 'Komatsu', 'PC210', 'SNS1', 'hours') returning id as ex \gset
select is((select count(*)::int from public.equipment_codes where asset_id = :'ex'), 0, 'new equipment has no QR code until one is generated');
select public.generate_equipment_code(:'ex') as code1 \gset
select is((select count(*)::int from public.equipment_codes where asset_id = :'ex' and revoked_at is null), 1, 'Generate QR code creates one code for this equipment');
select ok((select short_code ~ '^[A-HJKMNP-Z2-9]{10}$' from public.equipment_codes where id = :'code1'), 'the typed code is 10 characters without 0/O/1/I/L');
select is(tests.error_code(format($$select public.generate_equipment_code(%L)$$, :'ex')), 'reason_required', 'replacing a code needs a reason');
select public.generate_equipment_code(:'ex', 'Label damaged') as code2 \gset
select ok((select revoked_at is not null from public.equipment_codes where id = :'code1'), 'the old code stops working');
select short_code as sc, token as tk from public.equipment_codes where id = :'code2' \gset
reset role;

select is((public.equipment_public(:'tk') ->> 'asset_number'), 'EX-S1', 'the scanned token finds the equipment');
select is((public.equipment_public(lower(substr(:'sc', 1, 4)) || '-' || substr(:'sc', 5)) ->> 'asset_number'), 'EX-S1', 'the typed code works in any case, with dashes');
select is(public.equipment_public((select token from public.equipment_codes where id = :'code1')), null, 'a replaced code finds nothing');

-- Drivers
select tests.authenticate_as(:'owner');
select public.create_driver_profile(:'org', 'Dee Driver') as created \gset
select is((:'created'::jsonb ->> 'driver_number')::int, 1, 'the first driver is D-0001');
reset role;
select tests.create_user('driver-' || (:'created'::jsonb ->> 'id') || '@drivers.hvems.invalid', 'Dee Driver') as duser \gset
select lives_ok(format($$select public.link_driver_account(%L, %L)$$, :'created'::jsonb ->> 'id', :'duser'), 'the login account is linked');
select is((select role::text from public.org_memberships where user_id = :'duser'), 'driver_operator', 'with the driver role');
select is(app.mfa_required(:'org', :'owner'), false, 'a driver does not make the Owner need MFA');
select ok(not app.member_limit_reached(:'org', false), 'drivers do not count towards the member-login limit');

select is((public.driver_sign_in(:'sc', 1, '482916') ->> 'code'), 'pin_not_set', 'before setup there is no PIN');
select is((public.driver_sign_in(:'sc', 1, 'WRONGCOD', '482916') ->> 'ok')::boolean, false, 'a wrong setup code is refused');
select is(tests.error_code(format($$select public.driver_sign_in(%L, 1, %L, '111111')$$, :'sc', :'created'::jsonb ->> 'setup_code')), 'weak_pin',
  'an easy PIN is refused');
select is((public.driver_sign_in(:'sc', 1, :'created'::jsonb ->> 'setup_code', '482916') ->> 'ok')::boolean, true, 'setup code + new PIN signs in');
select is((public.driver_sign_in(:'sc', 1, :'created'::jsonb ->> 'setup_code', '482916') ->> 'ok')::boolean, false, 'the setup code works only once');
select is((public.driver_sign_in(:'sc', 1, '482916') ->> 'user_id')::uuid, :'duser'::uuid, 'Driver ID + PIN signs in as the driver');
select is((public.driver_sign_in(:'sc', 2, '482916') ->> 'ok')::boolean, false, 'an unknown Driver ID is refused');

-- Lockout after 5 wrong PINs, and the attempts are kept (not rolled back).
select public.driver_sign_in(:'sc', 1, '000000') from generate_series(1, 5);
select ok((select locked_until > now() from public.driver_profiles where user_id = :'duser'), 'five wrong PINs lock the profile');
select is(tests.error_code(format($$select public.driver_sign_in(%L, 1, '482916')$$, :'sc')), 'driver_locked', 'even the right PIN is refused while locked');

-- Manager resets; deactivation suspends the membership.
select tests.authenticate_as(:'owner');
select ok((public.reset_driver_setup((:'created'::jsonb ->> 'id')::uuid) ->> 'setup_code') is not null, 'a manager issues a new setup code');
select lives_ok(format($$select public.set_driver_active(%L, false)$$, :'created'::jsonb ->> 'id'), 'a manager deactivates the driver');
reset role;
select is((select status::text from public.org_memberships where user_id = :'duser'), 'suspended', 'the driver''s membership is suspended');
select is((public.driver_sign_in(:'sc', 1, '482916') ->> 'ok')::boolean, false, 'a deactivated driver cannot sign in');

-- Drivers only see equipment they're permitted on; archiving revokes the code.
select tests.authenticate_as(:'owner');
select public.set_driver_active((:'created'::jsonb ->> 'id')::uuid, true);
select public.archive_asset(:'ex', 'Sold to dealer', current_date, 'sold', true);
reset role;
select is(public.equipment_public(:'sc'), null, 'archiving revokes the code');

select * from finish();
rollback;
