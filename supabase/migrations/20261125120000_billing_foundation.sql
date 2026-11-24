-- =============================================================================
-- Billing slice 1 (2D, CS-34..39, ADR-006): Stripe customers, saved cards, webhook log.
-- * Each organisation that pays has one Stripe customer (HVEMS's own account, no Connect).
-- * Saved cards (payment_methods, created in 2A) are written only by the server from
--   Stripe's own data: after a SetupIntent succeeds, or from a verified webhook. The
--   browser never supplies card details or card rows.
-- * billing_gate(): the signed-in person's check (org.billing.manage, MFA when required)
--   before the server talks to Stripe for that organisation.
-- * stripe_events: every verified webhook event, stored once by its id (idempotent).
-- =============================================================================

create table public.billing_customers (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  livemode boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
create policy billing_customers_read on public.billing_customers for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])
);

create table public.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null,
  livemode boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text check (error is null or char_length(error) <= 1000)
);
alter table public.stripe_events enable row level security;

-- One default card per organisation.
create unique index payment_methods_one_default on public.payment_methods (organisation_id) where is_default and detached_at is null;

-- ---------------------------------------------------------------------------
-- The signed-in person's check before any Stripe call for the organisation.
-- ---------------------------------------------------------------------------
create or replace function public.billing_gate(p_organisation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.organisations%rowtype;
begin
  perform app.require_capability(p_organisation_id, 'org.billing.manage');
  perform app.require_mfa_if_needed(p_organisation_id);
  select * into o from public.organisations where id = p_organisation_id;
  if o.id is null or o.status = 'closed' then perform app.raise('not_found', 'Organisation not found'); end if;
  return jsonb_build_object(
    'organisation_id', o.id, 'name', o.name, 'kind', o.kind, 'contact_email', o.contact_email,
    'stripe_customer_id', (select stripe_customer_id from public.billing_customers where organisation_id = o.id),
    'user_id', auth.uid());
end $$;
revoke execute on function public.billing_gate(uuid) from public, anon;
grant execute on function public.billing_gate(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Server-only writers (service role), with the acting person for the audit history.
-- ---------------------------------------------------------------------------
create or replace function app.require_service_role() returns void
language plpgsql stable set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then perform app.raise('forbidden', 'Server only'); end if;
end $$;

create or replace function public.record_billing_customer(p_organisation_id uuid, p_customer_id text, p_livemode boolean, p_actor uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  insert into public.billing_customers (organisation_id, stripe_customer_id, livemode)
  values (p_organisation_id, p_customer_id, coalesce(p_livemode, false))
  on conflict (organisation_id) do nothing;
  if found then
    perform app.audit('create', 'billing_customers', null, p_organisation_id, '{}'::jsonb,
      jsonb_build_object('stripe_customer_id', p_customer_id, 'actor_user_id', p_actor));
  end if;
end $$;

-- Saves (or refreshes) a card Stripe confirmed for the organisation's customer.
create or replace function public.record_payment_method(
  p_organisation_id uuid, p_payment_method_id text, p_brand text, p_last4 text, p_exp_month integer, p_exp_year integer,
  p_make_default boolean, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_new boolean;
begin
  perform app.require_service_role();
  if p_payment_method_id !~ '^(pm|card)_[A-Za-z0-9]+$' then perform app.raise('invalid_payment_method', 'Not a Stripe payment method'); end if;
  if not exists (select 1 from public.billing_customers where organisation_id = p_organisation_id) then
    perform app.raise('no_billing_customer', 'The organisation has no billing customer');
  end if;
  select id into v_id from public.payment_methods where stripe_payment_method_id = p_payment_method_id;
  v_new := v_id is null;
  if v_id is not null and (select organisation_id from public.payment_methods where id = v_id) <> p_organisation_id then
    perform app.raise('forbidden', 'This card belongs to another organisation');
  end if;
  if coalesce(p_make_default, false) or not exists (
       select 1 from public.payment_methods where organisation_id = p_organisation_id and is_default and detached_at is null) then
    update public.payment_methods set is_default = false where organisation_id = p_organisation_id and is_default;
    p_make_default := true;
  end if;
  insert into public.payment_methods (organisation_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
  values (p_organisation_id, p_payment_method_id, lower(p_brand), p_last4, p_exp_month, p_exp_year, coalesce(p_make_default, false))
  on conflict (stripe_payment_method_id) do update set
    brand = excluded.brand, last4 = excluded.last4, exp_month = excluded.exp_month, exp_year = excluded.exp_year,
    is_default = excluded.is_default or public.payment_methods.is_default, detached_at = null
  returning id into v_id;
  if v_new then
    perform app.audit('create', 'payment_methods', v_id, p_organisation_id,
      jsonb_build_object('card', jsonb_build_object('to', initcap(coalesce(p_brand, 'card')) || ' ending ' || coalesce(p_last4, '????'))),
      jsonb_build_object('actor_user_id', p_actor));
  end if;
  return v_id;
end $$;

create or replace function public.set_default_payment_method_record(p_organisation_id uuid, p_payment_method_id text, p_actor uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  if not exists (select 1 from public.payment_methods where organisation_id = p_organisation_id
                 and stripe_payment_method_id = p_payment_method_id and detached_at is null) then
    perform app.raise('not_found', 'Card not found');
  end if;
  update public.payment_methods set is_default = false where organisation_id = p_organisation_id and is_default;
  update public.payment_methods set is_default = true where stripe_payment_method_id = p_payment_method_id;
  perform app.audit('update', 'payment_methods', null, p_organisation_id, '{"default":{"to":true}}'::jsonb,
    jsonb_build_object('stripe_payment_method_id', p_payment_method_id, 'actor_user_id', p_actor));
end $$;

-- A card removed in HVEMS or detached in Stripe. The next newest card becomes the default.
create or replace function public.mark_payment_method_detached(p_payment_method_id text, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.payment_methods%rowtype;
begin
  perform app.require_service_role();
  select * into r from public.payment_methods where stripe_payment_method_id = p_payment_method_id for update;
  if r.id is null or r.detached_at is not null then return; end if;
  update public.payment_methods set detached_at = now(), is_default = false where id = r.id;
  if r.is_default then
    update public.payment_methods set is_default = true
    where id = (select id from public.payment_methods where organisation_id = r.organisation_id and detached_at is null
                order by created_at desc limit 1);
  end if;
  perform app.audit('delete', 'payment_methods', r.id, r.organisation_id,
    jsonb_build_object('card', jsonb_build_object('from', initcap(coalesce(r.brand, 'card')) || ' ending ' || coalesce(r.last4, '????'))),
    jsonb_build_object('actor_user_id', p_actor));
end $$;

-- Webhook log: true the first time an event id is seen (or when an earlier delivery failed), false for a repeat.
create or replace function public.record_stripe_event(p_id text, p_type text, p_livemode boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  insert into public.stripe_events (id, type, livemode) values (p_id, p_type, p_livemode)
  on conflict (id) do update set error = null, received_at = now()
    where public.stripe_events.processed_at is null and public.stripe_events.error is not null;
  return found;
end $$;

create or replace function public.finish_stripe_event(p_id text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  update public.stripe_events set processed_at = case when p_error is null then now() end, error = left(p_error, 1000) where id = p_id;
end $$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.record_billing_customer(uuid, text, boolean, uuid)',
    'public.record_payment_method(uuid, text, text, text, integer, integer, boolean, uuid)',
    'public.set_default_payment_method_record(uuid, text, uuid)',
    'public.mark_payment_method_detached(text, uuid)',
    'public.record_stripe_event(text, text, boolean)',
    'public.finish_stripe_event(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $do$;
revoke execute on function app.require_service_role() from public, anon;
