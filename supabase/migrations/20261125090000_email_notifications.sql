-- =============================================================================
-- Email notifications (CS-40, NOT-01/02) through MailerSend.
-- * Every in-app notification can also go by email. A trigger puts a row in
--   email_outbox; the web app's dispatch route (/api/email/dispatch) claims a
--   batch, sends it through MailerSend and records the result, retrying with
--   back-off. pg_cron + pg_net call the route every minute once the route's
--   address and secret are stored in Vault (see the end of this file).
-- * Personal preferences: maintenance and marketplace emails can be turned off;
--   safety and account-security emails cannot (safety-critical).
-- * Nothing is sent until HVEMS turns on `email.enabled` (platform setting) and
--   the MailerSend API key is set on the server. Rows older than
--   `email.max_age_hours` when they would be sent are skipped, not sent late.
-- =============================================================================

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('email.enabled', 'false', 'Send notification emails (in-app notifications always work)', 'confirmed', 'CS-40'),
  ('email.from_address', '"notifications@hvems.com.au"', 'Sender address for notification emails (a verified MailerSend domain)', 'recommended', 'CS-40'),
  ('email.from_name', '"HVEMS"', 'Sender name for notification emails', 'recommended', 'CS-40'),
  ('email.max_age_hours', '48', 'Notification emails not sent within this many hours are skipped', 'recommended', 'CS-40')
on conflict (key) do nothing;

-- Which preference group a notification kind belongs to. Safety and account emails can't be turned off.
create or replace function app.notification_group(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('critical_defect', 'operator_not_fit', 'out_of_service_hold', 'breakdown', 'regulator_notice', 'alert_escalated') then 'safety'
    when p_kind in ('support_access_started') then 'account'
    when p_kind like 'marketplace\_%' or p_kind like 'provider\_%' then 'marketplace'
    else 'maintenance'
  end
$$;

-- ---------------------------------------------------------------------------
-- Personal preferences
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_maintenance boolean not null default true,
  email_marketplace boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy notification_preferences_own on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function app.set_updated_at();

create or replace function public.set_notification_preferences(p_maintenance boolean, p_marketplace boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform app.raise('not_signed_in', 'Sign in first'); end if;
  insert into public.notification_preferences (user_id, email_maintenance, email_marketplace)
  values (auth.uid(), coalesce(p_maintenance, true), coalesce(p_marketplace, true))
  on conflict (user_id) do update set email_maintenance = excluded.email_maintenance, email_marketplace = excluded.email_marketplace;
end $$;
revoke execute on function public.set_notification_preferences(boolean, boolean) from public, anon;
grant execute on function public.set_notification_preferences(boolean, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Outbox (server only: no policies, so only the service role reads it)
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'sending');
create index email_outbox_org_idx on public.email_outbox (organisation_id);
create index email_outbox_recipient_idx on public.email_outbox (recipient_id);
alter table public.email_outbox enable row level security;

-- Queue an email for each new notification when email is on and the person hasn't turned that group off.
create or replace function app.queue_notification_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_group text := app.notification_group(new.kind);
  p public.notification_preferences%rowtype;
begin
  if not coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'email.enabled'), false) then
    return new;
  end if;
  select * into p from public.notification_preferences where user_id = new.recipient_id;
  if p.user_id is not null and ((v_group = 'maintenance' and not p.email_maintenance) or (v_group = 'marketplace' and not p.email_marketplace)) then
    return new;
  end if;
  insert into public.email_outbox (notification_id, organisation_id, recipient_id)
  values (new.id, new.organisation_id, new.recipient_id)
  on conflict (notification_id) do nothing;
  return new;
end $$;
create trigger notifications_queue_email after insert on public.notifications
  for each row execute function app.queue_notification_email();

-- Claim a batch for sending (dispatch route, service role). Rows stuck in "sending" for 10 minutes are retried.
create or replace function public.claim_email_batch(p_limit integer default 25)
returns table (
  id uuid, notification_id uuid, organisation_id uuid, organisation_name text, organisation_kind text,
  to_email text, to_name text, kind text, notification_group text, title text, body text, link_path text,
  asset_id uuid, inspection_id uuid, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_max_age integer := coalesce(app.setting_int('email.max_age_hours'), 48);
begin
  if coalesce(auth.role(), '') <> 'service_role' then perform app.raise('forbidden', 'Server only'); end if;
  -- Too old to be useful: skip instead of sending late.
  update public.email_outbox o set status = 'skipped', last_error = 'Older than email.max_age_hours'
  where o.status in ('pending', 'sending') and o.created_at < now() - make_interval(hours => v_max_age);
  return query
  with due as (
    select o.id from public.email_outbox o
    where (o.status = 'pending' and o.next_attempt_at <= now())
       or (o.status = 'sending' and o.next_attempt_at <= now() - interval '10 minutes')
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  ), claimed as (
    update public.email_outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now()
    from due where o.id = due.id
    returning o.*
  )
  select c.id, c.notification_id, c.organisation_id, org.name, org.kind::text,
         u.email::text, coalesce(pr.full_name, u.email)::text, n.kind, app.notification_group(n.kind), n.title, n.body, n.link_path,
         n.asset_id, n.inspection_id, n.created_at
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.organisations org on org.id = c.organisation_id
  join auth.users u on u.id = c.recipient_id
  left join public.profiles pr on pr.id = c.recipient_id;
end $$;
revoke execute on function public.claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

-- Record the outcome. Failures retry after 1, 5, 30 and 120 minutes, then stop as failed;
-- p_give_up stops at once (a permanent error such as an invalid address).
create or replace function public.complete_email(p_id uuid, p_ok boolean, p_error text default null, p_message_id text default null,
  p_give_up boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare o public.email_outbox%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then perform app.raise('forbidden', 'Server only'); end if;
  select * into o from public.email_outbox where id = p_id for update;
  if o.id is null then perform app.raise('not_found', 'Email not found'); end if;
  if p_ok then
    update public.email_outbox set status = 'sent', sent_at = now(), last_error = null, provider_message_id = left(p_message_id, 200)
    where id = p_id;
  elsif o.attempts >= 5 or coalesce(p_give_up, false) then
    update public.email_outbox set status = 'failed', last_error = left(p_error, 1000) where id = p_id;
  else
    update public.email_outbox set status = 'pending', last_error = left(p_error, 1000),
      next_attempt_at = now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'])[greatest(1, least(o.attempts, 4))]
    where id = p_id;
  end if;
end $$;
revoke execute on function public.complete_email(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_email(uuid, boolean, text, text, boolean) to service_role;

-- HVEMS staff can see delivery figures in the console without reading message contents.
create or replace function public.email_outbox_summary() returns table (status text, emails bigint, oldest timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_staff() then perform app.raise('forbidden', 'HVEMS staff only'); end if;
  return query select o.status, count(*), min(o.created_at) from public.email_outbox o
    where o.created_at > now() - interval '7 days' group by o.status;
end $$;
revoke execute on function public.email_outbox_summary() from public, anon;
grant execute on function public.email_outbox_summary() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Every minute, pg_net calls the dispatch route when there is something to send.
-- To switch on (once per project, in the SQL editor):
--   select vault.create_secret('https://<company host>/api/email/dispatch', 'email_dispatch_url');
--   select vault.create_secret('<same value as EMAIL_DISPATCH_SECRET>', 'email_dispatch_secret');
-- ---------------------------------------------------------------------------
create or replace function app.kick_email_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.email_outbox where status in ('pending', 'sending') and next_attempt_at <= now()) then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') or not exists (select 1 from pg_namespace where nspname = 'vault') then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 25000)'
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
end $$;
revoke execute on function app.kick_email_dispatch() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hvems-email-dispatch', '* * * * *', 'select app.kick_email_dispatch()');
  end if;
end $do$;
