-- Console settings with history (ADM-08), platform dashboard (ADM-09), conversion to a company (CS-09).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('admin.cc@example.test', 'Ada Admin') as admin \gset
select tests.create_user('agent.cc@example.test', 'Al Agent') as agent \gset
select tests.create_user('acct.cc@example.test', 'Amy Account') as acct \gset
select tests.create_user('jm.cc@example.test', 'Jim Jobs') as jm \gset
insert into public.platform_staff (user_id, role) values (:'admin', 'platform_administrator'), (:'agent', 'support_agent');

-- ADM-08: settings
select tests.authenticate_as(:'agent', 'aal2');
select is(tests.error_code($$select public.set_platform_setting('marketplace.strike_limit', '4', 'Board decision')$$), 'forbidden', 'support agents cannot change settings');
reset role;
select tests.authenticate_as(:'admin', 'aal2');
select is(tests.error_code($$select public.set_platform_setting('marketplace.strike_limit', '"four"', 'Board decision')$$), 'invalid_value', 'a value keeps its type');
select is(tests.error_code($$select public.set_platform_setting('marketplace.strike_limit', '4', '')$$), 'reason_required', 'a change needs a reason');
select lives_ok($$select public.set_platform_setting('marketplace.strike_limit', '4', 'Board decision 21/11')$$, 'the Platform Administrator changes it');
select is((select value from public.platform_settings where key = 'marketplace.strike_limit'), '4'::jsonb, 'the new value applies at once');
select is((select old_value from public.platform_setting_changes where key = 'marketplace.strike_limit'), '3'::jsonb, 'the history keeps the old value');
select ok((select changed_by = :'admin'::uuid from public.platform_setting_changes where key = 'marketplace.strike_limit'), 'and who changed it');
-- ADM-09
select ok((public.platform_dashboard(30) ? 'verification_backlog'), 'the platform dashboard returns its figures');
reset role;
select is(tests.error_code($$update public.platform_setting_changes set reason = 'x'$$), '42501', 'the history can''t be edited');

-- CS-09: conversion
select tests.authenticate_as(:'acct');
select public.create_organisation('marketplace_customer', 'Morayfield Earthmoving') as mc \gset
reset role;
select tests.add_member(:'mc', :'jm', 'job_manager') as jm_m \gset
select tests.authenticate_as(:'acct');
select public.post_marketplace_job(:'mc', jsonb_build_object('title', 'Bobcat service', 'description', 'Regular service on the skid steer.',
  'category', 'diesel_mechanical', 'job_type', 'planned_service', 'region_code', 'moreton_bay', 'suburb', 'Morayfield',
  'asset_description', jsonb_build_object('class', 'Skid steer', 'make', 'Bobcat', 'model', 'S70', 'registration', 'XYZ987'))) as job \gset
reset role;
select tests.authenticate_as(:'jm');
select is(tests.error_code(format($$select public.convert_to_company(%L)$$, :'mc')), 'forbidden', 'only the Account Owner converts the account');
reset role;
select tests.authenticate_as(:'acct');
select lives_ok(format($$select public.convert_to_company(%L)$$, :'mc'), 'the Account Owner converts it to a company');
reset role;
select is((select kind::text from public.organisations where id = :'mc'), 'company', 'it is now a company');
select is((select role::text from public.org_memberships where organisation_id = :'mc' and user_id = :'acct'), 'owner', 'the Account Owner is the Owner');
select is((select role::text from public.org_memberships where organisation_id = :'mc' and user_id = :'jm'), 'fleet_manager', 'Job Managers become Fleet Managers');
select ok(exists (select 1 from public.membership_grants where membership_id = :'jm_m' and grant_type = 'marketplace_buyer' and revoked_at is null), 'with the Marketplace Buyer grant');
select ok(exists (select 1 from public.marketplace_jobs where id = :'job' and organisation_id = :'mc'), 'past jobs stay with the company');
select tests.authenticate_as(:'acct');
select public.convert_job_asset(:'job', 'SK-1', tests.class_id('excavator'), 'Bobcat', 'S70', 'XYZ987', 'QLD') as asset \gset
reset role;
select is((select asset_id from public.marketplace_jobs where id = :'job'), :'asset'::uuid, 'the job equipment becomes a managed asset and keeps its job');

select * from finish();
rollback;
