-- Driver credentials: managers maintain them, drivers see their own, expiry notifications once.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.c@example.test', 'Cara Owner') as owner \gset
select tests.create_user('fm.c@example.test', 'Cal Fleet') as fm \gset
select tests.create_user('tech.c@example.test', 'Cy Tech') as tech \gset
select tests.create_user('drv.c@example.test', 'Dee Driver') as drv \gset
select tests.create_user('other.c@example.test', 'Oli Other') as other \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Charlie Civil') as org \gset
reset role;
select tests.authenticate_as(:'other');
select public.create_organisation('company', 'Other Co') as org2 \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'tech', 'technician') as tech_m \gset
select tests.add_member(:'org', :'drv', 'driver_operator') as drv_m \gset
insert into public.driver_profiles (organisation_id, driver_number, full_name, user_id, membership_id)
values (:'org', 1, 'Dee Driver', :'drv', :'drv_m') returning id as driver \gset

-- Managers add credentials.
select tests.authenticate_as(:'fm', 'aal2');
select lives_ok(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, label, number, expires_on)
  values (%L, %L, 'driver_licence', 'HR', ' 12345678 ', current_date + 10)$$, :'org', :'driver'), 'a Fleet Manager adds a licence');
select lives_ok(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, number, expires_on)
  values (%L, %L, 'plant_ticket', 'HRWL-55', current_date - 2)$$, :'org', :'driver'), 'and an expired plant ticket');
select lives_ok(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, number)
  values (%L, %L, 'induction_card', 'IND-9')$$, :'org', :'driver'), 'and an induction card that does not expire');
select is(tests.error_code(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, number)
  values (%L, %L, 'other', 'X1')$$, :'org', :'driver')), '23514', 'an "other" credential needs a name');
select is(tests.error_code(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, label, number)
  values (%L, %L, 'driver_licence', 'hr', '999')$$, :'org', :'driver')), '23505', 'one licence of each class per driver');
select is((select number from public.driver_credentials where kind = 'driver_licence'), '12345678', 'numbers are trimmed');
reset role;

select tests.authenticate_as(:'tech');
select is((select count(*) from public.driver_credentials)::int, 0, 'a technician cannot see driver credentials');
select is(tests.error_code(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, number)
  values (%L, %L, 'track_safety', 'TS-1')$$, :'org', :'driver')), '42501', 'or add them');
reset role;
select tests.authenticate_as(:'drv');
select is((select count(*) from public.driver_credentials)::int, 3, 'the driver sees their own credentials');
update public.driver_credentials set number = 'HACKED';
select is((select count(*) from public.driver_credentials where number = 'HACKED')::int, 0, 'but cannot change them');
reset role;
select tests.authenticate_as(:'other');
select is((select count(*) from public.driver_credentials)::int, 0, 'other companies see nothing');
select is(tests.error_code(format($$insert into public.driver_credentials (organisation_id, driver_id, kind, number)
  values (%L, %L, 'track_safety', 'TS-1')$$, :'org2', :'driver')), '23503', 'a driver from another company cannot be used');
reset role;

-- Expiry notifications.
select is(app.notify_credential_expiry(), 2, 'one warning (licence) and one expiry (plant ticket)');
select is((select count(*) from public.notifications where organisation_id = :'org' and kind = 'credential_expiring' and recipient_id = :'owner')::int, 1,
  'the Owner is warned');
select is((select count(*) from public.notifications where organisation_id = :'org' and kind = 'credential_expired' and recipient_id = :'fm')::int, 1,
  'Fleet Managers are told about the expiry');
select is(app.notify_credential_expiry(), 0, 'each is notified only once');
update public.driver_credentials set expires_on = current_date + 5 where kind = 'plant_ticket';
select is(app.notify_credential_expiry(), 1, 'a new expiry date starts the warnings again');
select is((select count(*) from public.audit_events where organisation_id = :'org' and entity_type = 'driver_credentials')::int >= 4, true,
  'changes are in the audit history');

select * from finish();
rollback;
