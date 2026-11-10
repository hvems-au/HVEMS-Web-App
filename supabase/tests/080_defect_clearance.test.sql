-- Defect triage and two-step clearance (SoW §3.4, decisions #5, #6, D-07; O-09).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.q@example.test', 'Quinn Owner') as owner \gset
select tests.create_user('fm.q@example.test', 'Fay Fleet') as fm \gset
select tests.create_user('tech.q@example.test', 'Tom Tech') as tech \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Quebec Quarry') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
  values (:'org', 'LD-Q1', tests.class_id('loader'), 'CAT', '950', 'SNQ1', 'hours') returning id as ld \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'tech', 'technician') as tech_m \gset

create function pg_temp.answers(p_asset uuid, p_faults text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('item_code', e ->> 'item_code',
    'answer', case when e ->> 'item_code' = any (p_faults) then 'fault' else 'ok' end,
    'note', case when e ->> 'item_code' = any (p_faults) then 'Fault found' end))
  from jsonb_array_elements(public.prestart_checklist(p_asset)) e
$$;
create function pg_temp.defect(p_code text) returns uuid language sql as $$
  select id from public.defects where item_code = p_code order by reported_at desc limit 1
$$;
create function pg_temp.cond(p_asset uuid) returns text language sql as $$
  select condition::text from public.assets where id = p_asset
$$;

-- Critical LD-02 and Minor S-08 (horn) and Advisory G-01.
select tests.authenticate_as(:'tech');
select public.submit_prestart(:'ld', pg_temp.answers(:'ld', array['LD-02', 'S-08', 'G-01']), null, 100, null, '[]', true);
select is(pg_temp.cond(:'ld'), 'out_of_service', 'the Critical fault takes the loader out of service');
select is(tests.error_code(format($$select public.clear_defect(%L, 'Fixed it')$$, pg_temp.defect('LD-02'))), 'forbidden',
  'a technician without Clearance Authority cannot clear a Critical defect');
reset role;
select is((select due_date from public.defects where item_code = 'S-08'), ((now() at time zone 'Australia/Brisbane')::date + 7),
  'a Minor defect is due in 7 days');

select tests.authenticate_as(:'fm');
-- Triage rules.
select is(tests.error_code(format($$select public.triage_defect(%L, 'minor')$$, pg_temp.defect('LD-02'))), 'reason_required',
  'lowering needs a reason');
select is(tests.error_code(format($$select public.triage_defect(%L, 'minor', 'Not that bad')$$, pg_temp.defect('LD-02'))), 'evidence_required',
  'lowering a Critical needs photo evidence');
select lives_ok(format($$select public.triage_defect(%L, 'critical')$$, pg_temp.defect('S-08')), 'raising a Minor to Critical needs no reason');
select is((select count(*)::int from public.asset_condition_causes where source_id = pg_temp.defect('S-08') and resolved_at is null and kind = 'critical_defect'),
  1, 'the raised defect now holds a Critical cause');
select lives_ok(format($$select public.triage_defect(%L, 'minor', 'Horn works intermittently', array[%L])$$,
  pg_temp.defect('S-08'), :'org' || '/' || :'ld' || '/defect-x/photo.jpg'), 'a Fleet Manager lowers it back with a reason and a photo');
select is(tests.error_code(format($$select public.triage_defect(%L, 'minor', 'x', array['elsewhere/photo.jpg'])$$, pg_temp.defect('G-01'))),
  'invalid_evidence', 'evidence must be in this equipment''s folder');

-- Deferral (Minor only, within 30 days).
select is(tests.error_code(format($$select public.defer_defect(%L, current_date + 60, 'Part on order')$$, pg_temp.defect('S-08'))),
  'beyond_deferral_limit', 'deferral is limited to 30 days past the due date');
select lives_ok(format($$select public.defer_defect(%L, (select due_date + 14 from public.defects where id = %L), 'Part on order')$$,
  pg_temp.defect('S-08'), pg_temp.defect('S-08')), 'a Minor repair is deferred two weeks');
select is(tests.error_code(format($$select public.defer_defect(%L, current_date + 3, 'x')$$, pg_temp.defect('LD-02'))),
  'critical_cannot_be_deferred', 'Critical defects cannot be deferred');

-- Two-step clearance.
select is(tests.error_code(format($$select public.return_to_service(%L, 'Looks fine')$$, :'ld')), 'open_out_of_service_causes',
  'return to service is refused while the Critical defect is open');
select is((public.clear_defect(pg_temp.defect('LD-02'), 'Replaced coupler pin') ->> 'awaiting_return_to_service')::boolean, true,
  'marking the Critical repaired leaves the loader awaiting return to service');
select is(pg_temp.cond(:'ld'), 'out_of_service', 'it is still Out of service after the repair');
select is(tests.error_code(format($$select public.clear_defect(%L, 'Again')$$, pg_temp.defect('LD-02'))), 'defect_not_open',
  'a repaired defect cannot be cleared twice');
select lives_ok(format($$select public.return_to_service(%L, 'Test-run, coupler checked')$$, :'ld'), 'step 2: return to service');
select is(pg_temp.cond(:'ld'), 'needs_attention', 'the loader is back in use, with the open Minor defect still showing');
select is((select count(*)::int from public.return_to_service_events where asset_id = :'ld'), 1, 'the return to service is recorded');

-- Minor repaired, Advisory dismissed: the loader becomes Active.
select lives_ok(format($$select public.clear_defect(%L, 'Horn relay replaced')$$, pg_temp.defect('S-08')), 'the Minor defect is marked repaired');
select lives_ok(format($$select public.dismiss_defect(%L, 'Scratch was already there')$$, pg_temp.defect('G-01')), 'the Advisory is dismissed');
select is(pg_temp.cond(:'ld'), 'active', 'with nothing open the loader is Active');
reset role;

-- Merge keeps the more serious severity; repairer rule.
select tests.authenticate_as(:'tech');
select public.submit_prestart(:'ld', pg_temp.answers(:'ld', array['LD-03', 'G-02']), null, 110, null, '[]', true, null, true);
reset role;
select tests.authenticate_as(:'fm');
select lives_ok(format($$select public.merge_defect(%L, %L, 'Same crack')$$, pg_temp.defect('LD-03'), pg_temp.defect('G-02')), 'a duplicate is merged');
select is((select severity::text from public.defects where id = pg_temp.defect('G-02')), 'critical', 'the kept defect takes the Critical severity');
select is(pg_temp.cond(:'ld'), 'out_of_service', 'and the loader stays Out of service');
reset role;
select tests.authenticate_as(:'owner');
update public.organisations set settings = settings || '{"repairer_cannot_clear_own_critical": true}' where id = :'org';
reset role;
select tests.authenticate_as(:'fm');
select is(tests.error_code(format($$select public.clear_defect(%L, 'Welded')$$, pg_temp.defect('G-02'))), 'repairer_cannot_clear_own',
  'with the company rule on, the repairer cannot clear their own Critical repair');
select lives_ok(format($$select public.clear_defect(%L, 'Welded', %L)$$, pg_temp.defect('G-02'), :'tech'), 'someone else can clear it');
reset role;

select * from finish();
rollback;
