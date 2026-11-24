-- =============================================================================
-- Billing slice 2: monthly invoices (CS-34, CS-35, CS-38, CS-39).
-- * On the 1st (Brisbane), the database works out last month's charges:
--   - fleet: (highest number of current assets at any time in the month − free assets) × price;
--     the month the company first went above the free allowance is free (SoW 5.2);
--   - provider subscription: each provider verified for the whole month, after the
--     founding-provider waiver (SoW 5.3); nothing is charged before the public launch date.
-- * The web app (/api/billing/dispatch) turns each draft into a Stripe invoice charged to the
--   default card; the Stripe webhook records paid or failed. Stripe retries failed cards.
-- * An invoice still unpaid billing.restrict_after_days after its first failure restricts the
--   account (safety functions keep working); paying it lifts the restriction.
-- * Nothing is invoiced until HVEMS turns on billing.invoicing_live.
-- Interpretations recorded in docs/requirements/interpretations.md (I-B1..I-B4).
-- =============================================================================

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('billing.invoicing_live', 'false', 'Create and charge monthly invoices (fleet and provider subscriptions)', 'confirmed', '§5.2, §5.3'),
  ('billing.restrict_after_days', '14', 'Days an invoice can stay unpaid after its first failed payment before the account is restricted', 'recommended', '§5.8'),
  ('billing.charge_company_providers', 'false', 'Charge the provider subscription to companies that also work as providers (O-13)', 'to_be_confirmed', '§5.3, O-13'),
  ('marketplace.public_launch_at', 'null', 'Public launch date (ISO date): starts the founding-provider waiver; no provider subscription before it', 'to_be_confirmed', '§5.3')
on conflict (key) do nothing;

-- When a provider was first verified (founding-provider waiver).
alter table public.provider_profiles add column first_verified_at timestamptz;
update public.provider_profiles set first_verified_at = coalesce(decided_at, updated_at) where status = 'verified' and first_verified_at is null;
create or replace function app.provider_first_verified() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'verified' and new.first_verified_at is null then new.first_verified_at := now(); end if;
  return new;
end $$;
create trigger provider_profiles_first_verified before insert or update of status on public.provider_profiles
  for each row execute function app.provider_first_verified();

-- Billing notices are account notices: always emailed (app.notification_group → 'account').
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed', 'meter_reading_review', 'parts_approval', 'parts_decision', 'document_expiring',
  'provider_verification', 'provider_document_expiring', 'marketplace_job', 'marketplace_message', 'marketplace_proposal',
  'marketplace_engagement', 'marketplace_case', 'billing_invoice', 'billing_payment_failed', 'billing_restricted', 'billing_restored'));

create or replace function app.notification_group(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('critical_defect', 'operator_not_fit', 'out_of_service_hold', 'breakdown', 'regulator_notice', 'alert_escalated') then 'safety'
    when p_kind in ('support_access_started') or p_kind like 'billing\_%' then 'account'
    when p_kind like 'marketplace\_%' or p_kind like 'provider\_%' then 'marketplace'
    else 'maintenance'
  end
$$;

-- Members who hold a capability in an organisation (role or grant).
create or replace function app.capability_holders(p_organisation_id uuid, p_capability text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.user_id from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.status = 'active'
    and (exists (select 1 from app.role_capabilities rc where rc.role = m.role and rc.capability = p_capability)
      or exists (select 1 from public.membership_grants g
                 join app.grant_capabilities gc on gc.grant_type = g.grant_type and gc.capability = p_capability
                 where g.membership_id = m.id and g.revoked_at is null))
$$;
revoke execute on function app.capability_holders(uuid, text) from public, anon, authenticated;

create or replace function app.notify_billing(p_org uuid, p_kind text, p_title text, p_body text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p_org, u, p_kind, p_title, p_body, 'billing' from app.capability_holders(p_org, 'org.billing.view') u
$$;
revoke execute on function app.notify_billing(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind text not null check (kind in ('fleet', 'provider')),
  period_start date not null check (extract(day from period_start) = 1),
  description text not null check (char_length(description) <= 300),
  amount_cents bigint not null check (amount_cents > 0),
  gst_cents bigint not null default 0 check (gst_cents >= 0 and gst_cents <= amount_cents),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sending', 'open', 'paid', 'failed', 'void')),
  stripe_invoice_id text unique check (stripe_invoice_id is null or stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  number text,
  hosted_url text check (hosted_url is null or hosted_url ~ '^https://'),
  pdf_url text check (pdf_url is null or pdf_url ~ '^https://'),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  first_failed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz,
  unique (organisation_id, kind, period_start)
);
create index billing_invoices_status_idx on public.billing_invoices (status);
alter table public.billing_invoices enable row level security;
create policy billing_invoices_read on public.billing_invoices for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[]) or (select app.is_platform_staff())
);

-- The Brisbane calendar month as timestamps.
create or replace function app.billing_month_start(p_month date) returns timestamptz
language sql immutable set search_path = '' as $$ select (date_trunc('month', p_month)::date)::timestamp at time zone 'Australia/Brisbane' $$;
create or replace function app.billing_month_end(p_month date) returns timestamptz
language sql immutable set search_path = '' as $$ select ((date_trunc('month', p_month) + interval '1 month')::date)::timestamp at time zone 'Australia/Brisbane' $$;

-- SoW 5.2: the highest number of current assets at any time in the month.
create or replace function app.highest_asset_count(p_org uuid, p_month date) returns integer
language sql stable security definer set search_path = '' as $$
  with bounds as (select app.billing_month_start(p_month) s, app.billing_month_end(p_month) e),
  opening as (
    select coalesce(sum(delta), 0)::integer n from public.asset_count_events, bounds
    where organisation_id = p_org and occurred_at < bounds.s
  ),
  running as (
    select (select n from opening) + sum(delta) over (order by occurred_at, id) as n
    from public.asset_count_events, bounds
    where organisation_id = p_org and occurred_at >= bounds.s and occurred_at < bounds.e
  )
  select greatest((select n from opening), coalesce((select max(n) from running), 0))::integer
$$;

create or replace function app.gst_for(p_amount bigint, p_month date) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'gst.registered'), false)
     and p_month >= coalesce((select (value #>> '{}')::date from public.platform_settings where key = 'gst.registered_from'), '-infinity'::date)
    then round(p_amount / 11.0)::bigint else 0 end
$$;

-- Work out last month's charges (or p_month's). Idempotent: one invoice per organisation, kind and month.
create or replace function public.prepare_monthly_invoices(p_month date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, ((now() at time zone 'Australia/Brisbane') - interval '1 month')::date))::date;
  v_start timestamptz := app.billing_month_start(v_month);
  v_end timestamptz := app.billing_month_end(v_month);
  v_free integer := coalesce(app.setting_int('pricing.fleet_free_assets'), 5);
  v_per bigint := coalesce(app.setting_int('pricing.fleet_per_asset_cents'), 3000);
  v_provider bigint := coalesce(app.setting_int('pricing.provider_subscription_cents'), 9900);
  v_launch timestamptz := (select (value #>> '{}')::timestamptz from public.platform_settings where key = 'marketplace.public_launch_at' and value <> 'null'::jsonb);
  v_companies boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'billing.charge_company_providers'), false);
  v_label text := to_char(v_month, 'FMMonth YYYY');
  v_n integer := 0;
  r record;
  v_high integer;
  v_amount bigint;
  v_waiver_end timestamptz;
begin
  -- Execute is granted to the service role only; pg_cron runs it as the owner.
  if not coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'billing.invoicing_live'), false) then
    return 0;
  end if;
  if v_month >= date_trunc('month', now() at time zone 'Australia/Brisbane')::date then
    perform app.raise('month_not_finished', 'Only a finished month can be invoiced');
  end if;

  -- Fleet subscription.
  for r in select o.id, o.first_exceeded_free_allowance_at from public.organisations o
           where o.kind = 'company' and o.status in ('active', 'restricted') loop
    v_high := app.highest_asset_count(r.id, v_month);
    v_amount := greatest(v_high - v_free, 0) * v_per;
    continue when v_amount = 0;
    continue when r.first_exceeded_free_allowance_at is not null
      and date_trunc('month', r.first_exceeded_free_allowance_at at time zone 'Australia/Brisbane')::date = v_month;
    insert into public.billing_invoices (organisation_id, kind, period_start, description, amount_cents, gst_cents, details)
    values (r.id, 'fleet', v_month, format('Fleet subscription, %s: %s assets (%s free) at %s', v_label, v_high, v_free, to_char(v_per / 100.0, 'FM$999,990.00')),
            v_amount, app.gst_for(v_amount, v_month),
            jsonb_build_object('highest_assets', v_high, 'free_assets', v_free, 'per_asset_cents', v_per))
    on conflict (organisation_id, kind, period_start) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;

  -- Provider subscription (no charges before the public launch).
  if v_launch is not null then
    for r in select o.id, o.kind, pp.first_verified_at from public.provider_profiles pp
             join public.organisations o on o.id = pp.organisation_id
             where pp.status = 'verified' and o.status in ('active', 'restricted')
               and pp.first_verified_at <= v_start and (o.kind = 'provider' or (v_companies and o.kind = 'company')) loop
      -- Founding providers (verified by 90 days after launch): 3 months free from launch or verification, whichever is later.
      if r.first_verified_at <= v_launch + interval '90 days' then
        v_waiver_end := greatest(r.first_verified_at, v_launch) + interval '3 months';
        continue when v_start < v_waiver_end;
      end if;
      continue when v_start < v_launch;
      insert into public.billing_invoices (organisation_id, kind, period_start, description, amount_cents, gst_cents, details)
      values (r.id, 'provider', v_month, format('Provider subscription, %s', v_label), v_provider, app.gst_for(v_provider, v_month),
              jsonb_build_object('price_cents', v_provider))
      on conflict (organisation_id, kind, period_start) do nothing;
      if found then v_n := v_n + 1; end if;
    end loop;
  end if;
  return v_n;
end $$;
revoke execute on function public.prepare_monthly_invoices(date) from public, anon, authenticated;
grant execute on function public.prepare_monthly_invoices(date) to service_role;

-- The dispatch route claims drafts to send to Stripe.
create or replace function public.claim_draft_invoices(p_limit integer default 20)
returns table (id uuid, organisation_id uuid, organisation_name text, stripe_customer_id text, kind text, period_start date,
               description text, amount_cents bigint, gst_cents bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  return query
  with due as (
    select i.id from public.billing_invoices i
    where i.status = 'draft' or (i.status = 'sending' and i.sent_at is null and i.created_at < now() - interval '15 minutes')
    order by i.created_at limit greatest(1, least(coalesce(p_limit, 20), 100)) for update skip locked
  ), claimed as (
    update public.billing_invoices i set status = 'sending' from due where i.id = due.id returning i.*
  )
  select c.id, c.organisation_id, o.name, bc.stripe_customer_id, c.kind, c.period_start, c.description, c.amount_cents, c.gst_cents
  from claimed c join public.organisations o on o.id = c.organisation_id
  left join public.billing_customers bc on bc.organisation_id = c.organisation_id;
end $$;

-- Record what Stripe did with an invoice (dispatch route and webhook). Outcome: open, paid, failed or void.
create or replace function public.record_invoice_outcome(
  p_id uuid, p_stripe_invoice_id text, p_outcome text, p_number text default null, p_hosted_url text default null,
  p_pdf_url text default null, p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.billing_invoices%rowtype;
begin
  perform app.require_service_role();
  if p_outcome not in ('open', 'paid', 'failed', 'void') then perform app.raise('invalid_outcome', 'Unknown outcome'); end if;
  select * into i from public.billing_invoices
  where (p_id is not null and id = p_id) or (p_id is null and stripe_invoice_id = p_stripe_invoice_id) for update;
  if i.id is null then return; end if; -- Not an HVEMS monthly invoice.
  if i.status = 'paid' and p_outcome <> 'paid' then return; end if; -- Late events never undo a payment.
  update public.billing_invoices set
    status = p_outcome,
    stripe_invoice_id = coalesce(p_stripe_invoice_id, stripe_invoice_id),
    number = coalesce(p_number, number),
    hosted_url = coalesce(p_hosted_url, hosted_url),
    pdf_url = coalesce(p_pdf_url, pdf_url),
    last_error = case when p_outcome = 'failed' then left(p_error, 1000) when p_outcome = 'paid' then null else last_error end,
    first_failed_at = case when p_outcome = 'failed' then coalesce(first_failed_at, now()) else first_failed_at end,
    sent_at = coalesce(sent_at, case when p_outcome <> 'void' then now() end),
    paid_at = case when p_outcome = 'paid' then coalesce(paid_at, now()) else paid_at end
  where id = i.id;

  if p_outcome = 'failed' and i.status <> 'failed' then
    perform app.notify_billing(i.organisation_id, 'billing_payment_failed', 'Payment failed: ' || i.description,
      format('The card was declined. Update your card under Billing; the account is restricted if this stays unpaid for %s days.',
             coalesce(app.setting_int('billing.restrict_after_days'), 14)));
  elsif p_outcome = 'paid' and i.status <> 'paid' then
    perform app.audit('paid', 'billing_invoices', i.id, i.organisation_id, '{}'::jsonb,
      jsonb_build_object('amount_cents', i.amount_cents, 'number', coalesce(p_number, i.number)));
    -- Paying the last overdue invoice lifts a restriction for non-payment.
    if (select status from public.organisations where id = i.organisation_id) = 'restricted'
       and not exists (select 1 from public.billing_invoices where organisation_id = i.organisation_id and status = 'failed') then
      update public.organisations set status = 'active' where id = i.organisation_id;
      perform app.audit('unrestrict', 'organisations', i.organisation_id, i.organisation_id,
        '{"status":{"from":"restricted","to":"active"}}'::jsonb, '{"reason":"Overdue invoices paid"}'::jsonb);
      perform app.notify_billing(i.organisation_id, 'billing_restored', 'Account restored', 'Thanks: the overdue invoice is paid and the account works normally again.');
    end if;
  elsif p_outcome = 'open' and i.status in ('draft', 'sending') then
    perform app.notify_billing(i.organisation_id, 'billing_invoice', 'New invoice: ' || i.description,
      format('%s will be charged to your default card.', to_char(i.amount_cents / 100.0, 'FM$999,990.00')));
  end if;
end $$;

-- Daily: restrict accounts with an invoice unpaid too long after its first failure.
create or replace function app.sweep_billing_restrictions() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_days integer := coalesce(app.setting_int('billing.restrict_after_days'), 14); r record; v_n integer := 0;
begin
  for r in select distinct o.id from public.organisations o
           join public.billing_invoices i on i.organisation_id = o.id
           where o.status = 'active' and i.status = 'failed' and i.first_failed_at < now() - make_interval(days => v_days) loop
    update public.organisations set status = 'restricted' where id = r.id;
    perform app.audit('restrict', 'organisations', r.id, r.id, '{"status":{"from":"active","to":"restricted"}}'::jsonb,
      jsonb_build_object('reason', 'Invoice unpaid ' || v_days || ' days after the first failed payment'));
    perform app.notify_billing(r.id, 'billing_restricted', 'Account restricted for non-payment',
      'Adding equipment, members and marketplace activity are paused until the overdue invoice is paid. Safety functions keep working.');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function app.sweep_billing_restrictions() from public, anon, authenticated;

do $do$
declare f text;
begin
  foreach f in array array['public.claim_draft_invoices(integer)', 'public.record_invoice_outcome(uuid, text, text, text, text, text, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $do$;

-- ---------------------------------------------------------------------------
-- Schedule: invoices at 01:00 Brisbane on the 1st (15:00 UTC the day before), sent by the
-- dispatch route (pg_net, same Vault secrets as email); restrictions swept daily.
-- ---------------------------------------------------------------------------
create or replace function app.kick_billing_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.billing_invoices where status = 'draft') then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') or not exists (select 1 from pg_namespace where nspname = 'vault') then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 55000)'
    using replace(v_url, '/api/email/dispatch', '/api/billing/dispatch'),
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
end $$;
revoke execute on function app.kick_billing_dispatch() from public, anon, authenticated;

create or replace function app.run_monthly_billing() returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Only on the 1st in Brisbane (the cron runs at 15:00 UTC every day).
  if extract(day from now() at time zone 'Australia/Brisbane') = 1 then
    perform public.prepare_monthly_invoices(null);
  end if;
  perform app.sweep_billing_restrictions();
end $$;
revoke execute on function app.run_monthly_billing() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hvems-billing-daily', '5 15 * * *', 'select app.run_monthly_billing()');
    perform cron.schedule('hvems-billing-dispatch', '*/10 * * * *', 'select app.kick_billing_dispatch()');
  end if;
end $do$;
