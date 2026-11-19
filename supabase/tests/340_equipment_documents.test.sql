-- Equipment documents: permissions inherited from the equipment, replace with a reason, expiry reminders.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.doc@example.test', 'Dot Owner') as owner \gset
select tests.create_user('fm.doc@example.test', 'Dan Fleet') as fm \gset
select tests.create_user('drv.doc@example.test', 'Del Driver') as drv \gset
select tests.create_user('other.doc@example.test', 'Ola Other') as other \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Docs Co') as org \gset
reset role;
select tests.authenticate_as(:'other');
select public.create_organisation('company', 'Elsewhere Ltd') as org2 \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');
select tests.add_member(:'org', :'drv', 'driver_operator');
update public.organisations set operators_any_equipment = false where id = :'org';
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model)
values (:'org', 'DOC-1', tests.class_id('excavator'), 'CAT', '320') returning id as asset \gset

select tests.authenticate_as(:'fm');
select is(tests.error_code(format($$select public.add_document(%L, 'insurance', 'Insurance', 'elsewhere/x.pdf', 'x.pdf')$$, :'asset')), 'invalid_file',
  'a file must be uploaded for this equipment');
select public.add_document(:'asset', 'insurance', 'Insurance certificate', :'org' || '/' || :'asset' || '/ins.pdf', 'ins.pdf',
  'application/pdf', 1000, current_date + 20) as doc \gset
select is((select uploaded_by from public.documents where id = :'doc'), :'fm'::uuid, 'the uploader is set by the database');
select is(tests.error_code(format($$select public.add_document(%L, 'insurance', 'Insurance 2027', %L, 'ins2.pdf', null, null, null, null, %L, '')$$,
  :'asset', :'org' || '/' || :'asset' || '/ins2.pdf', :'doc')), 'reason_required', 'replacing needs a reason');
select public.add_document(:'asset', 'insurance', 'Insurance 2027', :'org' || '/' || :'asset' || '/ins2.pdf', 'ins2.pdf', null, null,
  current_date + 380, null, :'doc', 'Renewed') as doc2 \gset
select is((select superseded_by from public.documents where id = :'doc'), :'doc2'::uuid, 'the old one is kept, marked replaced');
select throws_ok(format($$delete from public.documents where id = %L$$, :'doc'), '42501', null, 'documents cannot be deleted');
reset role;

select tests.authenticate_as(:'drv');
select is((select count(*) from public.documents)::int, 0, 'an operator without access to the equipment sees none of its documents');
select is(tests.error_code(format($$select public.add_document(%L, 'manual', 'Manual', %L, 'm.pdf')$$, :'asset', :'org' || '/' || :'asset' || '/m.pdf')), 'forbidden',
  'operators cannot add documents');
reset role;
select tests.authenticate_as(:'other');
select is((select count(*) from public.documents)::int, 0, 'another company sees nothing');
reset role;

-- Reminders: a document expiring in 5 days gets one reminder (counts as both 30 and 7 days)
select tests.authenticate_as(:'fm');
select public.add_document(:'asset', 'registration', 'Registration', :'org' || '/' || :'asset' || '/rego.pdf', 'rego.pdf', null, null, current_date + 5) as rego \gset
reset role;
select ok(app.notify_document_expiry() >= 1, 'the daily check sends reminders');
select is((select count(*) from public.notifications where kind = 'document_expiring' and recipient_id = :'owner' and title like '%Registration%')::int, 1, 'the Owner is reminded');
select is(app.notify_document_expiry(), 0, 'each reminder is sent once');

select * from finish();
rollback;
