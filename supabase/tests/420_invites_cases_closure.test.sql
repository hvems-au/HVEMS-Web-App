-- Invitations to companies working as providers; case owner and notes; closing an organisation.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('poster.ic@example.test', 'Pia Poster') as poster \gset
select tests.create_user('co.ic@example.test', 'Col Company') as cowner \gset
select tests.create_user('fm.ic@example.test', 'Flo Fleet') as cfm \gset
select tests.create_user('admin.ic@example.test', 'Ada Admin') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'platform_administrator');

select tests.authenticate_as(:'poster');
select public.create_organisation('marketplace_customer', 'Petrie Plant Hire') as pc \gset
reset role;
select tests.authenticate_as(:'cowner');
select public.create_organisation('company', 'Clontarf Civil', '99 000 000 000') as co \gset
select public.save_provider_profile(:'co', '{"categories": ["diesel_mechanical"], "region_codes": ["moreton_bay"]}');
reset role;
select tests.add_member(:'co', :'cfm', 'fleet_manager') as cfm_m \gset

-- Invitations reach a company working as a provider
select tests.authenticate_as(:'poster');
select public.post_marketplace_job(:'pc', jsonb_build_object('title', 'Gearbox noise', 'description', 'Loud whine from the gearbox in third gear.',
  'category', 'diesel_mechanical', 'job_type', 'breakdown_repair', 'region_code', 'moreton_bay', 'suburb', 'Petrie', 'invited_only', true,
  'asset_description', jsonb_build_object('class', 'Truck'))) as job \gset
select is(public.invite_providers(:'job', array[:'co']::uuid[]), 1, 'a company working as a provider can be invited');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = :'cowner' and kind = 'marketplace_job'), 'and its Owner is told');

-- Case owner and internal notes
select tests.authenticate_as(:'poster');
select public.post_marketplace_job(:'pc', jsonb_build_object('title', 'Brake pads', 'description', 'Front brake pads worn on the truck.',
  'category', 'diesel_mechanical', 'job_type', 'planned_service', 'region_code', 'moreton_bay', 'suburb', 'Petrie',
  'asset_description', jsonb_build_object('class', 'Truck'))) as job2 \gset
reset role;
insert into public.marketplace_proposals (job_id, provider_id, valid_until) values (:'job2', :'co', now() + interval '1 day') returning id as prop \gset
insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, gst_applies, available_from, valid_until, fee_cents, fee_consented_at, created_by)
values (:'prop', 1, 'fixed', 30000, true, current_date + 1, now() + interval '1 day', 2900, now(), :'cowner') returning id as ver \gset
insert into public.marketplace_engagements (job_id, organisation_id, provider_id, proposal_id, proposal_version_id, accepted_by)
values (:'job2', :'pc', :'co', :'prop', :'ver', :'poster') returning id as eng \gset
select tests.authenticate_as(:'poster');
select public.raise_marketplace_case(:'eng', 'conduct', 'Provider was rude on the phone') as kase \gset
reset role;
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(format($$select public.assign_marketplace_case(%L, %L)$$, :'kase', :'staff'), 'HVEMS assigns an owner');
select lives_ok(format($$select public.add_marketplace_case_note(%L, 'Called both parties')$$, :'kase'), 'and adds an internal note');
reset role;
select is((select owner_id from public.marketplace_cases where id = :'kase'), :'staff'::uuid, 'the case has its owner');
select tests.authenticate_as(:'poster');
select is((select count(*) from public.marketplace_case_events where case_id = :'kase' and internal)::int, 0, 'the parties never see internal notes');
select is(tests.error_code(format($$select public.add_marketplace_case_note(%L, 'x y')$$, :'kase')), 'forbidden', 'and can''t add them');
reset role;

-- Closing: needs a recent full export and no work in progress
select tests.authenticate_as(:'cfm');
select is(tests.error_code(format($$select public.close_organisation(%L, 'Clontarf Civil', 'Sold the business')$$, :'co')), 'forbidden', 'a Fleet Manager can''t close the company');
reset role;
select tests.authenticate_as(:'cowner');
select ok(array_length(public.closure_blockers(:'co'), 1) = 3, 'closing is blocked without an export, with an engagement in progress and an open case');
select is(tests.error_code(format($$select public.close_organisation(%L, 'Wrong name', 'Sold the business')$$, :'co')), 'confirm_name', 'the name must be typed exactly');
select is(tests.error_code(format($$select public.close_organisation(%L, 'Clontarf Civil', 'Sold the business')$$, :'co')), 'closure_blocked', 'and the blockers stop it');
reset role;
update public.marketplace_engagements set status = 'cancelled', cancelled_at = now(), cancelled_by_side = 'poster', cancel_reason = 'Test' where id = :'eng';
update public.marketplace_cases set status = 'decided', outcome = 'Test', upheld = false where id = :'kase';
select tests.authenticate_as(:'cowner');
select public.log_report_export(:'co', 'full-export', 10, '{}');
select is(cardinality(public.closure_blockers(:'co')), 0, 'after a full export and with nothing in progress it can close');
select lives_ok(format($$select public.close_organisation(%L, 'Clontarf Civil', 'Sold the business')$$, :'co'), 'the Owner closes it');
select is(tests.error_code(format($$select public.save_provider_profile(%L, '{}')$$, :'co')), 'forbidden', 'members lose access');
reset role;
select is((select status::text from public.organisations where id = :'co'), 'closed', 'the organisation is closed');
select is((select status from public.marketplace_proposals where id = :'prop'), 'withdrawn', 'its active proposals are withdrawn');
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(format($$select public.reopen_organisation(%L, 'Closed by mistake')$$, :'co'), 'a Platform Administrator can reopen it');
reset role;
select is((select status::text from public.organisations where id = :'co'), 'active', 'and it is active again');

select * from finish();
rollback;
