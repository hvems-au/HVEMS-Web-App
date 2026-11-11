-- Tenancy, identity, roles, grants, invitations, MFA and support access.
-- Covers brief critical tests 1, 2, 3, 13 and SoW §2.4, §2.5, §2.6, §3.9.
begin;
\ir _helpers.psql
select no_plan();

-- ---------------------------------------------------------------- fixtures
select tests.create_user('owner.a@example.test', 'Olivia Owner') as owner_a \gset
select tests.create_user('owner.b@example.test', 'Oscar Owner') as owner_b \gset
select tests.create_user('fm.a@example.test', 'Fiona Fleet') as fm_a \gset
select tests.create_user('driver.a@example.test', 'Dan Driver') as driver_a \gset
select tests.create_user('tech.a@example.test', 'Tara Tech') as tech_a \gset
select tests.create_user('provider@example.test', 'Pat Provider') as prov_user \gset
select tests.create_user('invitee@example.test', 'Ivy Invitee') as invitee \gset
select tests.create_user('staff@hvems.test', 'Sam Staff') as staff \gset

select ok(exists (select 1 from public.profiles where id = :'owner_a' and full_name = 'Olivia Owner'),
  'a profile is created for every new auth user');

select tests.authenticate_as(:'owner_a');
select public.create_organisation('company', 'Alpha Haulage') as org_a \gset
reset role;
select tests.authenticate_as(:'owner_b');
select public.create_organisation('company', 'Bravo Plant Hire') as org_b \gset
reset role;
select tests.authenticate_as(:'prov_user');
select is(tests.error_code($$select public.create_organisation('provider', 'No ABN Mechanics')$$), 'abn_required',
  'provider accounts require an ABN');
select is(tests.error_code($$select public.create_organisation('provider', 'Bad ABN Mechanics', '12 345 678 901')$$), 'invalid_abn',
  'ABN checksum is validated');
select public.create_organisation('provider', 'Moreton Mobile Diesel', '51 824 753 556') as org_p \gset
reset role;

select is((select role::text from public.org_memberships where organisation_id = :'org_a' and user_id = :'owner_a'), 'owner',
  'creator of a company becomes its Owner');
select is((select role::text from public.org_memberships where organisation_id = :'org_p' and user_id = :'prov_user'), 'provider_owner',
  'creator of a provider account becomes its Provider Owner');

select tests.add_member(:'org_a', :'fm_a', 'fleet_manager') as fm_membership \gset
select tests.add_member(:'org_a', :'driver_a', 'driver_operator') as driver_membership \gset
select tests.add_member(:'org_a', :'tech_a', 'technician') as tech_membership \gset

insert into public.clients (organisation_id, name) values (:'org_b', 'Bravo Client Pty Ltd') returning id as client_b \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
values (:'org_b', 'B-001', tests.class_id('excavator'), 'CAT', '336F', 'SER-B-001') returning id as asset_b \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
values (:'org_a', 'A-001', tests.class_id('excavator'), 'Komatsu', 'PC210', 'SER-A-001') returning id as asset_a \gset

-- ------------------------------------------------- critical test 1: isolation
select tests.authenticate_as(:'owner_a');
select is((select count(*)::int from public.organisations), 1, 'company A owner sees only their own organisation');
select is((select count(*)::int from public.assets where organisation_id = :'org_b'), 0, 'company A cannot read company B assets');
select is((select count(*)::int from public.clients where organisation_id = :'org_b'), 0, 'company A cannot read company B clients');
select is((select count(*)::int from public.org_memberships where organisation_id = :'org_b'), 0, 'company A cannot read company B memberships');
select is((select count(*)::int from public.audit_events where organisation_id = :'org_b'), 0, 'company A cannot read company B audit history');
select is((select count(*)::int from public.profiles where id = :'owner_b'), 0, 'company A cannot read profiles of unrelated people');

-- --------------------------------- critical test 3: spoofed organisation id
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'X-1', %L, 'CAT', '320', 'S1')$$, :'org_b', tests.class_id('excavator'))), '42501',
  'inserting into another organisation by supplying its id is refused by RLS');
update public.assets set notes = 'tampered' where id = :'asset_b';
select is((select count(*)::int from public.assets where notes = 'tampered'), 0, 'updates to another organisation''s assets affect no rows');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, owner_type, client_id)
  values (%L, 'A-XLINK', %L, 'CAT', '320', 'S2', 'client_owned', %L)$$, :'org_a', tests.class_id('excavator'), :'client_b')), '23503',
  'an asset cannot reference a client belonging to another organisation');
select is(tests.error_code(format($$select public.create_invitation(%L, 'x@example.test', 'viewer')$$, :'org_b')), 'forbidden',
  'cannot invite people into another organisation');
reset role;

-- --------------------------------- critical test 2: portal/role separation
select tests.authenticate_as(:'prov_user');
select is((select count(*)::int from public.assets), 0, 'a provider account sees no company assets');
select is((select count(*)::int from public.organisations where kind = 'company'), 0, 'a provider account sees no company organisations');
select is(tests.error_code(format($$insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number)
  values (%L, 'P-1', %L, 'CAT', '320', 'S3')$$, :'org_p', tests.class_id('excavator'))), '42501',
  'provider roles cannot create register assets');
reset role;
select is(tests.error_code(format($$insert into public.org_memberships (organisation_id, user_id, role) values (%L, %L, 'provider_manager')$$,
  :'org_a', :'invitee')), 'role_not_valid_for_account_type', 'a company membership can never carry a provider role');
select is(tests.error_code(format($$insert into public.org_memberships (organisation_id, user_id, role) values (%L, %L, 'technician')$$,
  :'org_p', :'invitee')), 'role_not_valid_for_account_type', 'a provider account can never carry a company role');

select tests.as_anon();
select is(tests.error_code($$select count(*) from public.assets$$), '42501', 'anonymous requests cannot read assets');
select is(tests.error_code($$select public.create_organisation('company', 'Anon Co')$$), '42501', 'anonymous requests cannot call RPCs');
reset role;

-- --------------------------------------------------- capabilities and grants
select tests.authenticate_as(:'fm_a');
select ok('assets.manage' = any (public.my_capabilities(:'org_a')), 'Fleet Manager can add and edit equipment (spec B.1)');
select ok(not ('assets.import_archive' = any (public.my_capabilities(:'org_a'))), 'Fleet Manager cannot import or archive equipment (spec B.1)');
select ok('defects.triage' = any (public.my_capabilities(:'org_a')), 'Fleet Manager can triage defects');
select ok('defects.clear_critical' = any (public.my_capabilities(:'org_a')), 'Fleet Managers hold the clearance powers by role (decision O-09)');
select ok(not ('marketplace.post' = any (public.my_capabilities(:'org_a'))), 'Fleet Manager cannot post jobs without Marketplace Buyer');
reset role;
select tests.authenticate_as(:'owner_a', 'aal2');
select ok('defects.clear_critical' = any (public.my_capabilities(:'org_a')), 'Owner holds Clearance Authority by default');
select ok('marketplace.post' = any (public.my_capabilities(:'org_a')), 'Owner can post marketplace jobs');
select is(tests.error_code(format($$select public.assign_grant(%L, 'clearance_authority')$$, :'fm_membership')),
  '23514', 'Clearance Authority requires a competency note');
select lives_ok(format($$select public.assign_grant(%L, 'clearance_authority', null, 'Cert IV Heavy Commercial Vehicle Mechanical; 10 years')$$, :'fm_membership'),
  'Owner assigns Clearance Authority with a competency note');
select is(tests.error_code(format($$select public.assign_grant(%L, 'clearance_authority', null, 'Experienced')$$, :'driver_membership')),
  'grant_not_valid_for_role', 'drivers cannot hold Clearance Authority');
select is(tests.error_code(format($$select public.assign_grant(%L, 'marketplace_buyer')$$, :'tech_membership')),
  'grant_not_valid_for_role', 'technicians cannot hold Marketplace Buyer');
select is(tests.error_code(format($$select public.assign_grant(%L, 'approval_limit')$$, :'tech_membership')),
  '23514', 'Approval Limit needs an amount');
select is(tests.error_code(format($$select public.update_member_role(%L, 'administrator')$$,
  (select id from public.org_memberships where organisation_id = :'org_a' and user_id = :'owner_a'))),
  'ownership_change_not_supported', 'the Owner role cannot be changed by a role edit');
reset role;
select tests.authenticate_as(:'fm_a');
select ok('defects.clear_critical' = any (public.my_capabilities(:'org_a')), 'the granted Fleet Manager now holds Clearance Authority');
select is(tests.error_code(format($$select public.assign_grant(%L, 'marketplace_buyer')$$, :'fm_membership')), 'forbidden',
  'a Fleet Manager cannot assign grants');
reset role;

-- --------------------------------------------- MFA (SoW §2.5) and invitations
select tests.authenticate_as(:'owner_a', 'aal1');
select ok((select mfa_required from public.my_contexts() where organisation_id = :'org_a'),
  'MFA becomes required for the Owner once the company has a second member');
select is(tests.error_code(format($$select public.create_invitation(%L, 'invitee@example.test', 'viewer')$$, :'org_a')), 'mfa_required',
  'privileged member actions are refused without MFA when MFA is required');
reset role;
select tests.authenticate_as(:'owner_a', 'aal2');
select token as invite_token from public.create_invitation(:'org_a', 'Invitee@Example.test', 'viewer') \gset
select is(tests.error_code(format($$select public.create_invitation(%L, 'mike@example.test', 'owner')$$, :'org_a')),
  'role_not_valid_for_account_type', 'the Owner role cannot be granted by invitation');
reset role;
select ok((select token_hash <> convert_to(:'invite_token', 'utf8') from public.invitations where email = 'invitee@example.test'),
  'invitation tokens are stored only as hashes');
select tests.authenticate_as(:'owner_b');
select is(tests.error_code(format($$select public.accept_invitation(%L)$$, :'invite_token')), 'invitation_email_mismatch',
  'an invitation can only be accepted by the invited email address');
reset role;
select tests.authenticate_as(:'invitee');
select is(public.accept_invitation(:'invite_token'), :'org_a'::uuid, 'the invited person accepts and joins the company');
select is(tests.error_code(format($$select public.accept_invitation(%L)$$, :'invite_token')), 'invitation_used',
  'an invitation cannot be used twice');
select is((select role::text from public.my_contexts() where organisation_id = :'org_a'), 'viewer', 'the new member has the invited role');
reset role;

-- Free tier: up to 5 member logins while the company has 5 or fewer assets.
select is((select count(*)::int from public.org_memberships where organisation_id = :'org_a' and status = 'active'), 5,
  'fixture: company A now has five members');
select tests.authenticate_as(:'owner_a', 'aal2');
select is(tests.error_code(format($$select public.create_invitation(%L, 'sixth@example.test', 'viewer')$$, :'org_a')),
  'member_limit_reached', 'a sixth member login is refused while the company has five or fewer assets');
reset role;

-- ------------------------------------------------------ HVEMS staff & support
insert into public.platform_staff (user_id, role) values (:'staff', 'support_agent');
select tests.authenticate_as(:'staff', 'aal1');
select is((select count(*)::int from public.organisations), 0, 'HVEMS staff without MFA see nothing');
select is(tests.error_code(format($$select public.start_support_access(%L, 'Customer asked for help with import', 30, '000000')$$, :'org_a')),
  'forbidden', 'support access cannot start without MFA');
reset role;
select tests.authenticate_as(:'owner_a');
select public.my_support_pin(:'org_a') ->> 'pin' as pin_a \gset
reset role;
select tests.authenticate_as(:'staff', 'aal2');
select is((select count(*)::int from public.assets), 0, 'staff with MFA still cannot read customer records without support access');
select public.start_support_access(:'org_a', 'Customer asked for help with import', 30, :'pin_a') ->> 'grant_id' as support_grant \gset
select is((select count(*)::int from public.assets where organisation_id = :'org_a'), 1, 'time-limited support access allows reading that customer''s records');
select is((select count(*)::int from public.assets where organisation_id = :'org_b'), 0, 'support access is limited to the named organisation');
select is(tests.error_code(format($$select public.start_support_access(%L, 'Too long session requested', 600, '000000')$$, :'org_b')),
  'invalid_duration', 'support access duration is capped by the platform setting');
select public.end_support_access(:'support_grant');
select is((select count(*)::int from public.assets where organisation_id = :'org_a'), 0, 'ending support access removes visibility immediately');
reset role;
select tests.authenticate_as(:'owner_a');
select is((select count(*)::int from public.support_access_grants where organisation_id = :'org_a'), 1,
  'the customer Owner can see support access to their records');
reset role;
select tests.authenticate_as(:'owner_b');
select is((select count(*)::int from public.support_access_grants), 0, 'other customers cannot see that support access');
reset role;

-- ------------------------------------------- critical test 13: audit history
select ok((select count(*) from public.audit_events where organisation_id = :'org_a') >= 5, 'changes are recorded in audit history');
select ok(exists (select 1 from public.audit_events where entity_type = 'invitations' and changes ->> 'token_hash' = '[redacted]'),
  'secrets are redacted from audit history');
select ok(exists (select 1 from public.security_events where event_type = 'support_access_started' and organisation_id = :'org_a'),
  'support access is logged as a security event');
select is(tests.error_code($$update public.audit_events set action = 'x'$$), '42501', 'audit history cannot be edited, even by the database owner');
select is(tests.error_code($$delete from public.audit_events$$), '42501', 'audit history cannot be deleted, even by the database owner');
select tests.authenticate_as(:'owner_a');
select ok((select count(*) from public.audit_events) > 0, 'Owners can view their company''s audit history');
reset role;
select tests.authenticate_as(:'fm_a');
select is((select count(*)::int from public.audit_events), 0, 'Fleet Managers cannot view audit history');
reset role;

select * from finish();
rollback;
