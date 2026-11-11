-- Pre-start frequency and missed pre-starts.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.m2@example.test', 'Mo Owner') as owner \gset
select tests.create_user('fm.m2@example.test', 'Max Fleet') as fm \gset
select tests.create_user('drv.m2@example.test', 'Dot Driver') as drv \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Mike Mining') as org \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');
select tests.add_member(:'org', :'drv', 'driver_operator');

-- Wednesday 4 Nov 2026 is the day being checked (run at 2 am Thursday, Brisbane).
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, created_at) values
  (:'org', 'EX-1', tests.class_id('excavator'), 'CAT', '320', '2026-10-01'),
  (:'org', 'EX-2', tests.class_id('excavator'), 'CAT', '330', '2026-10-01'),
  (:'org', 'GEN-1', tests.class_id('portable_fixed_equipment'), 'Honda', 'EU70', '2026-10-01'),
  (:'org', 'EX-NEW', tests.class_id('excavator'), 'CAT', '336', '2026-11-04 12:00+10'),
  (:'org', 'EX-OFF', tests.class_id('excavator'), 'CAT', '320', '2026-10-01');
update public.assets set prestart_frequency = 'not_required' where asset_number = 'EX-OFF';
insert into public.inspections (organisation_id, asset_id, result, submitted_by, submitted_at, header, templates)
select :'org', id, 'pass', :'owner', '2026-11-04 07:30+10', '{}'::jsonb, '[]'::jsonb from public.assets where asset_number = 'EX-1';

select is(app.detect_missed_prestarts('2026-11-05 02:00+10'), 1, 'one daily pre-start was missed on Wednesday');
select is((select a.asset_number from public.missed_prestarts m join public.assets a on a.id = m.asset_id), 'EX-2',
  'it is EX-2: EX-1 had a pre-start, EX-NEW was added that day, EX-OFF needs none, GEN-1 is weekly');
select is(app.detect_missed_prestarts('2026-11-05 03:00+10'), 0, 'running again records nothing new');
select is((select count(*) from public.notifications where organisation_id = :'org' and kind = 'prestart_missed' and recipient_id = :'fm')::int, 1,
  'Fleet Managers are alerted once');

select is(app.detect_missed_prestarts('2026-11-08 02:00+10'), 0, 'Saturday is skipped');
select is(app.detect_missed_prestarts('2026-11-09 02:00+10'), 1, 'after Sunday, the weekly generator check is due and was missed');
select is((select frequency::text from public.missed_prestarts m join public.assets a on a.id = m.asset_id where a.asset_number = 'GEN-1'), 'weekly',
  'recorded as a weekly check');

-- Review
select id as missed_id from public.missed_prestarts m where m.frequency = 'daily' \gset
select tests.authenticate_as(:'drv');
select is((select count(*) from public.missed_prestarts)::int, 0, 'drivers cannot see missed pre-starts');
select is(tests.error_code(format($$select public.review_missed_prestart(%L, 'not_used')$$, :'missed_id')), 'forbidden', 'or review them');
reset role;
select tests.authenticate_as(:'fm', 'aal2');
select is(tests.error_code(format($$select public.review_missed_prestart(%L, 'missed')$$, :'missed_id')), 'note_required', '"missed" needs a note');
select lives_ok(format($$select public.review_missed_prestart(%L, 'missed', 'Operator spoken to; toolbox talk booked')$$, :'missed_id'),
  'a Fleet Manager reviews it');
reset role;
select is((select status from public.missed_prestarts where id = :'missed_id'), 'missed', 'the outcome is saved');
select ok(exists (select 1 from public.audit_events where entity_type = 'missed_prestarts' and entity_id = :'missed_id' and action = 'update'),
  'and audited');

select * from finish();
rollback;
