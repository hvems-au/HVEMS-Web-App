-- Email notifications: outbox, preferences, claiming and retries (CS-40).
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.e@example.test', 'Emma Owner') as owner \gset
select tests.create_user('fm.e@example.test', 'Eli Fleet') as fm \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Echo Earthworks') as org \gset
reset role;
select tests.add_member(:'org', :'fm', 'fleet_manager');

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
create function pg_temp.notify(p_user uuid, p_kind text, p_title text) returns uuid language sql as $$
  insert into public.notifications (organisation_id, recipient_id, kind, title, body)
  select organisation_id, p_user, p_kind, p_title, 'Body' from public.org_memberships where user_id = p_user limit 1
  returning id
$$;

-- Off by default: nothing is queued.
select pg_temp.notify(:'owner', 'minor_defect', 'Before email is on');
select is((select count(*)::int from public.email_outbox), 0, 'nothing is queued while email.enabled is off');

update public.platform_settings set value = 'true' where key = 'email.enabled';
select pg_temp.notify(:'owner', 'minor_defect', 'Horn not working') as n1 \gset
select is((select count(*)::int from public.email_outbox where notification_id = :'n1'), 1, 'a notification is queued once email is on');

-- Preferences: maintenance and marketplace can be turned off, safety can't.
select tests.authenticate_as(:'fm');
select lives_ok($$select public.set_notification_preferences(false, false)$$, 'a person turns off maintenance and marketplace emails');
select is((select email_maintenance from public.notification_preferences), false, 'and reads their own preference');
reset role;
select pg_temp.notify(:'fm', 'minor_defect', 'Muted maintenance') as n2 \gset
select pg_temp.notify(:'fm', 'marketplace_proposal', 'Muted marketplace') as n3 \gset
select pg_temp.notify(:'fm', 'critical_defect', 'Brakes failed') as n4 \gset
select is((select count(*)::int from public.email_outbox where notification_id in (:'n2', :'n3')), 0, 'muted groups are not emailed');
select is((select count(*)::int from public.email_outbox where notification_id = :'n4'), 1, 'safety emails are always sent');

-- Members never see the outbox, and can't claim or complete emails.
select tests.authenticate_as(:'owner');
select is((select count(*)::int from public.email_outbox), 0, 'members cannot read the outbox');
select is(tests.error_code($$select * from public.claim_email_batch(10)$$), '42501', 'members cannot claim emails');
select is((select count(*)::int from public.notification_preferences), 0, 'nor other people''s preferences');
reset role;

-- The server claims a batch, with the recipient and the portal details.
select pg_temp.as_service();
create temp table claimed on commit drop as select * from public.claim_email_batch(10);
select is((select count(*)::int from public.claim_email_batch(10)), 0, 'claimed emails are not claimed twice');
reset role;
select is((select count(*)::int from claimed), 2, 'the server claims the due emails');
select is((select to_email || '|' || organisation_kind || '|' || organisation_name || '|' || title from claimed where notification_id = :'n1'),
  'owner.e@example.test|company|Echo Earthworks|Horn not working', 'with the recipient, the organisation and the message');
select is((select status from public.email_outbox where notification_id = :'n1'), 'sending', 'claimed rows are marked sending');

-- Results: sent; a failure retries later, and stops after five attempts.
select id as e1 from public.email_outbox where notification_id = :'n1' \gset
select id as e4 from public.email_outbox where notification_id = :'n4' \gset
select pg_temp.as_service();
select public.complete_email(:'e1', true, null, 'msg-1');
select public.complete_email(:'e4', false, 'Timeout', null);
reset role;
select is((select status || '/' || provider_message_id from public.email_outbox where id = :'e1'), 'sent/msg-1', 'a sent email is recorded with the provider id');
select ok((select status = 'pending' and next_attempt_at > now() and last_error = 'Timeout' from public.email_outbox where id = :'e4'),
  'a failed email waits and retries');
update public.email_outbox set attempts = 5 where id = :'e4';
select pg_temp.as_service();
select public.complete_email(:'e4', false, 'Still failing', null);
reset role;
select is((select status from public.email_outbox where id = :'e4'), 'failed', 'after five attempts it stops as failed');
select is((select notification_group from claimed where notification_id = :'n4'), 'safety', 'the claim says which group the email belongs to');
select id as e1b from public.email_outbox where notification_id = :'n1' gset
update public.email_outbox set status = 'sending', sent_at = null where id = :'e1b';
select pg_temp.as_service();
select public.complete_email(:'e1b', false, 'Invalid recipient', null, true);
reset role;
select is((select status from public.email_outbox where id = :'e1b'), 'failed', 'a permanent error stops at once');

-- Old emails are skipped, not sent late.
select pg_temp.notify(:'owner', 'minor_defect', 'Old news') as n5 \gset
update public.email_outbox set created_at = now() - interval '3 days' where notification_id = :'n5';
select pg_temp.as_service();
select is((select count(*)::int from public.claim_email_batch(10) c where c.notification_id = :'n5'), 0, 'an email older than the limit is not sent');
reset role;
select is((select status from public.email_outbox where notification_id = :'n5'), 'skipped', 'it is marked skipped');

-- The group mapping.
select is(app.notification_group('alert_escalated'), 'safety', 'escalations are safety');
select is(app.notification_group('provider_verification'), 'marketplace', 'provider notices are marketplace');
select is(app.notification_group('parts_approval'), 'maintenance', 'parts approvals are maintenance');

select * from finish();
rollback;
