-- Organisation timezone and contact details (reconciliation §3 item 11).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.h@example.test', 'Hal Owner') as owner \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Hotel Earthmoving') as org \gset
select is((select timezone from public.organisations where id = :'org'), 'Australia/Brisbane', 'Brisbane is the default');

select lives_ok(format($$update public.organisations set timezone = 'Australia/Perth' where id = %L$$, :'org'), 'the Owner chooses another timezone');
select is((select timezone from public.organisations where id = :'org'), 'Australia/Perth', 'the timezone is saved');
select is(tests.error_code(format($$update public.organisations set timezone = 'Mars/Olympus' where id = %L$$, :'org')), 'invalid_timezone',
  'an unknown timezone is refused');

select lives_ok(format($$update public.organisations set contact_name = 'Hal', contact_email = 'hal@hotel.test', contact_phone = '07 3000 0000' where id = %L$$, :'org'),
  'the Owner saves contact details');
select is(tests.error_code(format($$update public.organisations set contact_email = 'not-an-email' where id = %L$$, :'org')), '23514',
  'an invalid contact email is refused');
select is(tests.error_code(format($$update public.organisations set contact_phone = 'call me' where id = %L$$, :'org')), '23514',
  'an invalid contact phone is refused');
reset role;

select * from finish();
rollback;
