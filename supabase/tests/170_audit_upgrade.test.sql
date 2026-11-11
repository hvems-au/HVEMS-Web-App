-- Audit upgrade: request context on events; daily hash chain detects tampering.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.a1@example.test', 'Ada Owner') as owner \gset
select tests.create_user('staff.a1@hvems.test', 'Sid Staff') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'platform_administrator');

-- Context from the headers the HVEMS server sends.
select set_config('request.headers', '{"x-hvems-portal":"company","x-hvems-client-ip":"203.0.113.7","x-hvems-user-agent":"TestBrowser/1.0"}', true);
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Audit Alpha') as org \gset
reset role;
select is((select context ->> 'ip' from public.audit_events where organisation_id = :'org' order by id limit 1), '203.0.113.7', 'the IP address is recorded');
select is((select context ->> 'portal' from public.audit_events where organisation_id = :'org' order by id limit 1), 'company', 'and the portal');
select app.security_event('test_event', :'org', '{}'::jsonb, :'owner');
select is((select context ->> 'user_agent' from public.security_events where event_type = 'test_event'), 'TestBrowser/1.0', 'security events get context too');
select set_config('request.headers', '', true);

-- Events on earlier days, then seal.
insert into public.audit_events (occurred_at, organisation_id, actor_method, action, entity_type, changes)
values (now() - interval '3 days', :'org', 'system', 'insert', 'assets', '{"asset_number":"A-1"}'),
       (now() - interval '2 days', :'org', 'system', 'update', 'assets', '{"make":{"from":"CAT","to":"Komatsu"}}');
select ok(app.seal_audit_days() >= 2, 'finished days are sealed');
select is((select count(*) from public.audit_daily_digests where day >= (now() at time zone 'Australia/Brisbane')::date)::int, 0, 'today is not sealed yet');
select is(app.seal_audit_days(), 0, 'sealing again adds nothing');
select is(tests.error_code($$update public.audit_daily_digests set digest = 'x'$$), '42501', 'digests cannot be changed');

select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code($$select public.verify_audit_chain()$$), 'forbidden', 'only HVEMS staff can verify');
select is((select count(*) from public.audit_daily_digests)::int, 0, 'companies cannot read the digests');
reset role;
select tests.authenticate_as(:'staff', 'aal2');
select is(jsonb_array_length(public.verify_audit_chain() -> 'broken'), 0, 'the chain verifies');
reset role;

-- Tamper with a past event (only possible by switching off the append-only guard).
alter table public.audit_events disable trigger audit_events_no_update;
update public.audit_events set changes = '{"make":{"from":"CAT","to":"Volvo"}}' where changes @> '{"make":{"to":"Komatsu"}}';
alter table public.audit_events enable trigger audit_events_no_update;
select tests.authenticate_as(:'staff', 'aal2');
select is(jsonb_array_length(public.verify_audit_chain() -> 'broken'), 1, 'a changed event breaks that day''s link');
select is((public.verify_audit_chain() -> 'broken' -> 0 ->> 'day')::date, ((now() - interval '2 days') at time zone 'Australia/Brisbane')::date,
  'and the broken day is reported');
reset role;

select * from finish();
rollback;
