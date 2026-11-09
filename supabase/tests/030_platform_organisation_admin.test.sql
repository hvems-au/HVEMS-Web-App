-- Super Admin organisation management: edit details, suspend and reinstate
-- (spec ADM-02, ACC-18, Appendix B.5).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.s@example.test', 'Sally Owner') as owner \gset
select tests.create_user('admin@hvems.test', 'Ada Admin') as admin \gset
select tests.create_user('agent@hvems.test', 'Sid Support') as agent \gset
insert into public.platform_staff (user_id, role) values (:'admin', 'platform_administrator'), (:'agent', 'support_agent');

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Sierra Earthmoving') as org \gset
reset role;

-- ------------------------------------------------------------ who may act
select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code(format($$select public.admin_update_organisation(%L, 'Hijacked', null, null, 'Australia/Brisbane')$$, :'org')),
  'forbidden', 'a company Owner cannot use the Super Admin edit');
select is(tests.error_code($$update public.organisations set status = 'active'$$), '42501',
  'members still have no column privilege on status');
reset role;

select tests.authenticate_as(:'admin', 'aal1');
select is(tests.error_code(format($$select public.admin_set_organisation_suspended(%L, true, 'Non-payment after notice')$$, :'org')),
  'forbidden', 'a Super Admin without MFA cannot suspend');
reset role;

select tests.authenticate_as(:'agent', 'aal2');
select is(tests.error_code(format($$select public.admin_set_organisation_suspended(%L, true, 'Non-payment after notice')$$, :'org')),
  'forbidden', 'Support Agents cannot suspend (B.5)');
reset role;

-- ------------------------------------------------------------ edit
select tests.authenticate_as(:'admin', 'aal2');
select is(tests.error_code(format($$select public.admin_update_organisation(%L, 'Sierra', null, '12 345 678 901', 'Australia/Brisbane')$$, :'org')),
  'invalid_abn', 'ABN checksum is validated');
select is(tests.error_code(format($$select public.admin_update_organisation(%L, 'Sierra', null, null, 'Mars/Olympus')$$, :'org')),
  'invalid_timezone', 'timezone must be a real zone');
select lives_ok(format($$select public.admin_update_organisation(%L, ' Sierra Earthmoving Pty Ltd ', 'Sierra Earthmoving Pty Ltd', '51 824 753 556', 'Australia/Perth')$$, :'org'),
  'Super Admin with MFA can edit an organisation');
reset role;
select is((select name || '|' || abn || '|' || timezone from public.organisations where id = :'org'),
  'Sierra Earthmoving Pty Ltd|51824753556|Australia/Perth', 'details are saved trimmed and normalised');

-- ------------------------------------------------------------ suspend
select tests.authenticate_as(:'admin', 'aal2');
select is(tests.error_code(format($$select public.admin_set_organisation_suspended(%L, true, 'short')$$, :'org')),
  'reason_required', 'a reason of at least 10 characters is required');
select is(public.admin_set_organisation_suspended(:'org', true, 'Repeated breaches of the terms of use')::text, 'suspended',
  'Super Admin can suspend');
select is(tests.error_code(format($$select public.admin_set_organisation_suspended(%L, true, 'Second suspension attempt')$$, :'org')),
  'already_suspended', 'suspending twice is refused');
reset role;

select ok((select suspended_at is not null and suspension_reason = 'Repeated breaches of the terms of use' from public.organisations where id = :'org'),
  'suspension time and reason are stored');
select ok(exists (select 1 from public.audit_events where organisation_id = :'org' and action = 'suspend'
  and changes ->> 'reason' = 'Repeated breaches of the terms of use' and actor_user_id = :'admin'), 'suspension is audited with its reason and actor');

select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'EX-1', %L, 'CAT', '320', 'SN1')$$, :'org', tests.class_id('excavator'))), 'account_suspended',
  'a suspended company cannot add equipment');
select is(tests.error_code(format($$select public.create_invitation(%L, 'new@example.test', 'fleet_manager')$$, :'org')),
  'account_suspended', 'a suspended company cannot invite members');
select ok(exists (select 1 from public.my_contexts() where organisation_id = :'org' and status = 'suspended'),
  'members can still sign in to a suspended organisation (safety functions continue)');
reset role;

-- ------------------------------------------------------------ reinstate
select tests.authenticate_as(:'admin', 'aal2');
select is(public.admin_set_organisation_suspended(:'org', false, 'Terms breach resolved with the Owner')::text, 'active',
  'Super Admin can reinstate');
select is(tests.error_code(format($$select public.admin_set_organisation_suspended(%L, false, 'Reinstate again please')$$, :'org')),
  'not_suspended', 'reinstating an active organisation is refused');
reset role;
select ok((select suspended_at is null and suspension_reason is null from public.organisations where id = :'org'),
  'reinstating clears the suspension');
select ok(exists (select 1 from public.audit_events where organisation_id = :'org' and action = 'reinstate'
  and changes ->> 'reason' = 'Terms breach resolved with the Owner'), 'reinstatement is audited with its reason');

select * from finish();
rollback;
