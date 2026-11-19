-- 2C Reports: export logging and deferral approver (CS-24, RPT-02/05, AUD-01).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.rp@example.test', 'Rita Owner') as owner \gset
select tests.create_user('tech.rp@example.test', 'Ray Tech') as tech \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Reports Pty') as org \gset
reset role;
select tests.add_member(:'org', :'tech', 'technician') as tech_m \gset

select tests.authenticate_as(:'owner');
select lives_ok(format($$select public.log_report_export(%L, 'asset-register', 12, '{"site": "x"}')$$, :'org'), 'the Owner exports a report');
reset role;
select ok(exists (select 1 from public.audit_events where organisation_id = :'org' and action = 'export' and entity_type = 'report'
  and context ->> 'report' = 'asset-register' and (context ->> 'rows')::int = 12 and actor_user_id = :'owner'), 'the export is in the audit history');

select tests.authenticate_as(:'tech');
select is(tests.error_code(format($$select public.log_report_export(%L, 'asset-register', 1)$$, :'org')), 'forbidden', 'technicians cannot export reports');
reset role;
select tests.authenticate_as(:'owner');
select is(tests.error_code(format($$select public.log_report_export(%L, 'Bad Name!', 1)$$, :'org')), 'invalid_report', 'report names are checked');
reset role;

-- Deferral approver
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model)
values (:'org', 'RP-1', tests.class_id('excavator'), 'CAT', '320') returning id as asset \gset
insert into public.defects (organisation_id, asset_id, severity, title, source, due_date)
values (:'org', :'asset', 'minor', 'Cracked mirror', 'prestart', current_date + 7) returning id as defect \gset
select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$select public.defer_defect(%L, current_date + 14, 'Part on order')$$, :'defect'), 'the Owner defers the repair');
reset role;
select is((select deferred_by from public.defects where id = :'defect'), :'owner'::uuid, 'a deferral records who approved it');
select ok((select deferred_at is not null from public.defects where id = :'defect'), 'and when');

select * from finish();
rollback;
