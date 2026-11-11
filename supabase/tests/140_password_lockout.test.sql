-- Password lockout: 5 wrong passwords lock for 15 minutes (O-11); tries left shown from the 3rd; server-only functions.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('lock.me@example.test', 'Lou Lock') as lou \gset

-- Only the server (service role) may call the functions.
select tests.authenticate_as(:'lou');
select is(tests.error_code($$select public.password_sign_in_status('lock.me@example.test')$$), '42501', 'signed-in users cannot read lock state');
select is(tests.error_code($$select public.record_password_sign_in('lock.me@example.test', true)$$), '42501', 'signed-in users cannot clear a lock');
select is(tests.error_code($$select count(*) from public.password_lockouts$$), '42501', 'the lock table cannot be read directly');
reset role;
select tests.as_anon();
select is(tests.error_code($$select public.record_password_sign_in('lock.me@example.test', false)$$), '42501', 'anonymous visitors cannot record attempts');
reset role;

select is((public.password_sign_in_status('lock.me@example.test') ->> 'locked')::boolean, false, 'not locked at first');
select is((public.record_password_sign_in('Lock.Me@example.test ', false, 'company') ->> 'show_remaining')::boolean, false, 'the first wrong password shows no count');
select public.record_password_sign_in('lock.me@example.test', false);
select is((public.record_password_sign_in('lock.me@example.test', false) ->> 'show_remaining')::boolean, true, 'from the third wrong password the tries left are shown');
select is((public.record_password_sign_in('lock.me@example.test', false) ->> 'remaining')::int, 1, 'four wrong passwords leave one try (email case and spaces ignored)');
select is((public.record_password_sign_in('lock.me@example.test', false) ->> 'locked')::boolean, true, 'the fifth wrong password locks the account');
select is((public.password_sign_in_status('lock.me@example.test') ->> 'locked')::boolean, true, 'the account reports locked');
select ok((public.password_sign_in_status('lock.me@example.test') ->> 'locked_until')::timestamptz between now() + interval '14 minutes' and now() + interval '16 minutes',
  'the lock lasts 15 minutes');
select is((select count(*) from public.security_events where user_id = :'lou' and event_type = 'password_sign_in_failed')::int, 5, 'each wrong password is recorded');
select is((select count(*) from public.security_events where user_id = :'lou' and event_type = 'account_locked')::int, 1, 'the lock is recorded once');
select public.record_password_sign_in('lock.me@example.test', false);
select is((select failed_count from public.password_lockouts where email = 'lock.me@example.test'), 5, 'attempts while locked are not counted');

-- After the lock runs out the count starts again.
update public.password_lockouts set locked_until = now() - interval '1 minute' where email = 'lock.me@example.test';
select is((public.password_sign_in_status('lock.me@example.test') ->> 'locked')::boolean, false, 'an expired lock no longer applies');
select is((public.record_password_sign_in('lock.me@example.test', false) ->> 'remaining')::int, 4, 'after a lock the count starts again');

-- Old failures are forgotten; a success clears everything.
update public.password_lockouts set last_failed_at = now() - interval '2 days' where email = 'lock.me@example.test';
select is((public.record_password_sign_in('lock.me@example.test', false) ->> 'remaining')::int, 4, 'failures older than 24 hours are not counted');
select public.record_password_sign_in('lock.me@example.test', true);
select is((select count(*) from public.password_lockouts where email = 'lock.me@example.test')::int, 0, 'a successful sign-in clears the count');

-- Unknown addresses lock the same way, without revealing anything.
select public.record_password_sign_in('nobody@example.test', false) from generate_series(1, 5);
select is((public.password_sign_in_status('nobody@example.test') ->> 'locked')::boolean, true, 'an unknown address locks like a real one');

select * from finish();
rollback;
