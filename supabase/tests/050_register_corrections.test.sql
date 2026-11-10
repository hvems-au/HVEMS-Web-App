-- Approved spec corrections (reconciliation §3 items 2, 3, 6):
-- Fleet Managers create/edit equipment and clients; import and archive stay
-- with Owner/Administrator; Viewers see costs; new disposal reasons.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.g@example.test', 'Gus Owner') as owner \gset
select tests.create_user('fm.g@example.test', 'Gina Fleet') as fm \gset
select tests.create_user('viewer.g@example.test', 'Vic Viewer') as viewer \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Golf Haulage') as org \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager') as fm_m \gset
select tests.add_member(:'org', :'viewer', 'viewer') as viewer_m \gset

select tests.authenticate_as(:'fm');
select lives_ok(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'EX-1', %L, 'CAT', '320', 'S-1')$$, :'org', tests.class_id('excavator')), 'a Fleet Manager adds equipment');
select lives_ok(format($$update public.assets set model = '320 GC' where organisation_id = %L and asset_number = 'EX-1'$$, :'org'),
  'a Fleet Manager edits equipment');
select is((select model from public.assets where asset_number = 'EX-1'), '320 GC', 'the edit is saved');
select lives_ok(format($$insert into public.clients (organisation_id, name) values (%L, 'Hotel Civil')$$, :'org'), 'a Fleet Manager adds a client');
select is(tests.error_code(format($$insert into public.sites (organisation_id, name) values (%L, 'India Yard')$$, :'org')), '42501',
  'sites stay with Owner/Administrator');
select is(tests.error_code(format($$select public.import_assets(%L, '[]'::jsonb, true)$$, :'org')), 'forbidden', 'a Fleet Manager cannot import');
select is(tests.error_code(format($$select public.archive_asset(id, 'Scrapped', current_date) from public.assets where asset_number = 'EX-1'$$)),
  'forbidden', 'a Fleet Manager cannot archive');
reset role;

select tests.authenticate_as(:'viewer');
select ok(app.has_capability(:'org', 'assets.costs.view'), 'a Viewer can see costs');
select ok(not app.has_capability(:'org', 'assets.manage'), 'a Viewer still cannot edit equipment');
reset role;

select tests.authenticate_as(:'owner');
select is(tests.error_code(format($$select public.archive_asset(id, 'Moved to sister company', current_date, 'transferred_out')
  from public.assets where asset_number = 'EX-1'$$)), null, 'transfer out with no open issues needs no acknowledgement');
select is((select archive_disposal::text from public.assets where asset_number = 'EX-1'), 'transferred_out', 'the disposal reason is stored');
reset role;

select is(enum_range(null::public.asset_disposal)::text, '{disposed,transferred_out,written_off,sold,other}',
  'disposal reasons: disposed, transferred out, written off, sold, other');

select * from finish();
rollback;
