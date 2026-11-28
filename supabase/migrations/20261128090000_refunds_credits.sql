-- =============================================================================
-- Billing slice 4: refunds, credits and waiver adjustments in the HVEMS console
-- (SoW §2.4, §5.5, §5.8; CS-38).
-- * Staff with the billing_approver authority (the Super Admin always counts) can:
--   - refund a paid monthly invoice, in full or in part;
--   - refund a collected connection fee (either party's), in full or in part;
--   - add a credit, which Stripe takes off the organisation's next invoice;
--   - restore company waivers to this month (no money moves).
-- * Every adjustment needs a reason. Above billing.second_approval_threshold_cents
--   ($500) a second, different approver must approve before any money moves.
-- * The web server carries out approved refunds and credits in Stripe
--   (idempotency key per adjustment) and records the result; failures can be retried.
-- * Customers' billing managers are told and see completed refunds and credits.
-- =============================================================================

create table public.billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind text not null check (kind in ('refund', 'credit', 'waiver_restore')),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  quantity integer not null default 0 check (quantity between 0 and 20),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  invoice_id uuid references public.billing_invoices (id) on delete set null,
  engagement_id uuid references public.marketplace_engagements (id) on delete set null,
  fee_side text check (fee_side is null or fee_side in ('poster', 'provider')),
  status text not null check (status in ('pending_approval', 'approved', 'processing', 'completed', 'rejected', 'failed')),
  requested_by uuid not null references auth.users (id) default auth.uid(),
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  stripe_ref text,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  processing_at timestamptz,
  completed_at timestamptz,
  check (kind <> 'refund' or ((invoice_id is null) <> (engagement_id is null))),
  check (engagement_id is null or fee_side is not null),
  check (kind = 'waiver_restore' or amount_cents > 0),
  check (kind <> 'waiver_restore' or quantity > 0),
  check (approved_by is null or approved_by <> requested_by)
);
create index billing_adjustments_org_idx on public.billing_adjustments (organisation_id, requested_at desc);
create index billing_adjustments_status_idx on public.billing_adjustments (status);
create index billing_adjustments_invoice_idx on public.billing_adjustments (invoice_id);
create index billing_adjustments_engagement_idx on public.billing_adjustments (engagement_id);
create index billing_adjustments_people_idx on public.billing_adjustments (requested_by, approved_by);
create index billing_adjustments_approved_by_idx on public.billing_adjustments (approved_by);
create trigger audit_billing_adjustments after insert or update on public.billing_adjustments
  for each row execute function app.audit_row_change('organisation_id');
alter table public.billing_adjustments enable row level security;
revoke all on public.billing_adjustments from anon, authenticated;
grant select on public.billing_adjustments to authenticated;
create policy billing_adjustments_read on public.billing_adjustments for select to authenticated using (
  (select app.is_platform_staff())
  or (status = 'completed' and kind in ('refund', 'credit')
      and organisation_id = any ((select app.orgs_with_capability('org.billing.view'))::uuid[])));

-- How much of a source is still refundable (adjustments that are not rejected or failed count).
create or replace function app.refunded_so_far(p_invoice uuid, p_engagement uuid, p_side text) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.billing_adjustments
  where kind = 'refund' and status not in ('rejected', 'failed')
    and ((p_invoice is not null and invoice_id = p_invoice) or (p_engagement is not null and engagement_id = p_engagement and fee_side = p_side))
$$;
revoke execute on function app.refunded_so_far(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.request_billing_adjustment(
  p_organisation_id uuid, p_kind text, p_amount_cents bigint, p_reason text,
  p_invoice_id uuid default null, p_engagement_id uuid default null, p_fee_side text default null, p_quantity integer default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_threshold bigint := coalesce(app.setting_int('billing.second_approval_threshold_cents'), 50000);
  i public.billing_invoices%rowtype;
  e public.marketplace_engagements%rowtype;
  v_max bigint;
  v_status text;
  v_id uuid;
begin
  if not app.has_platform_authority('billing_approver') then
    perform app.raise('forbidden', 'Only HVEMS billing approvers can make refunds, credits and waiver adjustments');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform app.raise('reason_required', 'Give a reason'); end if;
  if not exists (select 1 from public.organisations where id = p_organisation_id) then perform app.raise('not_found', 'Organisation not found'); end if;

  if p_kind = 'refund' then
    if (p_invoice_id is null) = (p_engagement_id is null) then perform app.raise('source_required', 'Refund an invoice or a connection fee'); end if;
    if p_invoice_id is not null then
      select * into i from public.billing_invoices where id = p_invoice_id and organisation_id = p_organisation_id for update;
      if i.id is null or i.status <> 'paid' then perform app.raise('not_refundable', 'Only a paid invoice can be refunded'); end if;
      v_max := i.amount_cents - app.refunded_so_far(i.id, null, null);
    else
      select * into e from public.marketplace_engagements where id = p_engagement_id for update;
      if e.id is null or e.fee_status not in ('collected', 'refunded') or p_fee_side not in ('poster', 'provider')
         or (p_fee_side = 'poster' and e.organisation_id <> p_organisation_id)
         or (p_fee_side = 'provider' and e.provider_id <> p_organisation_id) then
        perform app.raise('not_refundable', 'Only a connection fee this organisation paid can be refunded');
      end if;
      v_max := (case when p_fee_side = 'poster' then e.poster_fee_cents else e.provider_fee_cents end) - app.refunded_so_far(null, e.id, p_fee_side);
    end if;
    if coalesce(p_amount_cents, 0) <= 0 then perform app.raise('amount_required', 'Enter an amount'); end if;
    if p_amount_cents > v_max then
      perform app.raise('amount_too_high', format('At most %s can still be refunded', to_char(v_max / 100.0, 'FM$999,990.00')));
    end if;
  elsif p_kind = 'credit' then
    if coalesce(p_amount_cents, 0) <= 0 then perform app.raise('amount_required', 'Enter an amount'); end if;
    if p_amount_cents > 1000000 then perform app.raise('amount_too_high', 'A credit can be at most $10,000'); end if;
  elsif p_kind = 'waiver_restore' then
    if (select kind from public.organisations where id = p_organisation_id) <> 'company' then
      perform app.raise('not_a_company', 'Waivers are for companies');
    end if;
    if coalesce(p_quantity, 0) not between 1 and 20 then perform app.raise('quantity_required', 'Restore between 1 and 20 waivers'); end if;
  else
    perform app.raise('invalid_kind', 'Unknown adjustment');
  end if;

  -- Money above the threshold waits for a second approver; waivers move no money.
  v_status := case when p_kind = 'waiver_restore' then 'completed'
                   when p_amount_cents > v_threshold then 'pending_approval' else 'approved' end;
  insert into public.billing_adjustments (organisation_id, kind, amount_cents, quantity, reason, invoice_id, engagement_id, fee_side, status, completed_at)
  values (p_organisation_id, p_kind, case when p_kind = 'waiver_restore' then 0 else p_amount_cents end,
          case when p_kind = 'waiver_restore' then p_quantity else 0 end, btrim(p_reason),
          p_invoice_id, p_engagement_id, case when p_engagement_id is null then null else p_fee_side end,
          v_status, case when v_status = 'completed' then now() end)
  returning id into v_id;

  if p_kind = 'waiver_restore' then
    insert into public.company_waivers (organisation_id, month) select p_organisation_id, app.waiver_month() from generate_series(1, p_quantity);
    perform app.notify_billing(p_organisation_id, 'billing_invoice',
      case when p_quantity = 1 then 'A connection fee waiver was added' else p_quantity || ' connection fee waivers were added' end,
      'HVEMS added waivers to this month: ' || btrim(p_reason));
  end if;
  return v_id;
end $$;
revoke execute on function public.request_billing_adjustment(uuid, text, bigint, text, uuid, uuid, text, integer) from public, anon;
grant execute on function public.request_billing_adjustment(uuid, text, bigint, text, uuid, uuid, text, integer) to authenticated;

-- The second approver approves or rejects (never the person who asked).
create or replace function public.decide_billing_adjustment(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.billing_adjustments%rowtype;
begin
  if not app.has_platform_authority('billing_approver') then
    perform app.raise('forbidden', 'Only HVEMS billing approvers can approve refunds and credits');
  end if;
  select * into a from public.billing_adjustments where id = p_id for update;
  if a.id is null then perform app.raise('not_found', 'Not found'); end if;
  if a.status <> 'pending_approval' then perform app.raise('invalid_status', 'This has already been decided'); end if;
  if a.requested_by = auth.uid() then
    perform app.raise('second_approver_required', 'A different billing approver must approve this');
  end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 3 then
    perform app.raise('reason_required', 'Say why it''s rejected');
  end if;
  update public.billing_adjustments set status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = case when p_approve then auth.uid() end, approved_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = a.id;
end $$;
revoke execute on function public.decide_billing_adjustment(uuid, boolean, text) from public, anon;
grant execute on function public.decide_billing_adjustment(uuid, boolean, text) to authenticated;

-- A failed refund or credit can be tried again (by an approver).
create or replace function public.retry_billing_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.has_platform_authority('billing_approver') then perform app.raise('forbidden', 'Only HVEMS billing approvers can retry'); end if;
  update public.billing_adjustments set status = 'approved', last_error = null where id = p_id and status = 'failed';
  if not found then perform app.raise('invalid_status', 'Only a failed adjustment can be retried'); end if;
end $$;
revoke execute on function public.retry_billing_adjustment(uuid) from public, anon;
grant execute on function public.retry_billing_adjustment(uuid) to authenticated;

-- The server claims approved adjustments (one, or a batch) with what Stripe needs.
create or replace function public.claim_billing_adjustments(p_id uuid default null, p_limit integer default 20)
returns table (id uuid, number bigint, organisation_id uuid, organisation_name text, kind text, amount_cents bigint, reason text,
               stripe_customer_id text, stripe_invoice_id text, payment_intent text)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_service_role();
  return query
  with due as (
    select a.id from public.billing_adjustments a
    where a.kind in ('refund', 'credit') and (p_id is null or a.id = p_id)
      and (a.status = 'approved' or (a.status = 'processing' and a.processing_at < now() - interval '15 minutes'))
    order by a.requested_at limit greatest(1, least(coalesce(p_limit, 20), 100)) for update skip locked
  ), claimed as (
    update public.billing_adjustments a set status = 'processing', processing_at = now() from due where a.id = due.id returning a.*
  )
  select c.id, c.number, c.organisation_id, o.name, c.kind, c.amount_cents, c.reason, bc.stripe_customer_id, i.stripe_invoice_id,
         case c.fee_side when 'poster' then fa.poster_payment_intent when 'provider' then fa.provider_payment_intent end
  from claimed c
  join public.organisations o on o.id = c.organisation_id
  left join public.billing_customers bc on bc.organisation_id = c.organisation_id
  left join public.billing_invoices i on i.id = c.invoice_id
  left join public.connection_fee_attempts fa on fa.engagement_id = c.engagement_id and fa.state = 'confirmed';
end $$;

create or replace function public.complete_billing_adjustment(p_id uuid, p_ok boolean, p_stripe_ref text default null, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.billing_adjustments%rowtype;
begin
  perform app.require_service_role();
  select * into a from public.billing_adjustments where id = p_id for update;
  if a.id is null or a.status <> 'processing' then return; end if;
  if not p_ok then
    update public.billing_adjustments set status = 'failed', last_error = left(coalesce(p_error, 'Failed'), 1000) where id = a.id;
    return;
  end if;
  update public.billing_adjustments set status = 'completed', stripe_ref = p_stripe_ref, completed_at = now(), last_error = null where id = a.id;
  if a.engagement_id is not null then
    update public.marketplace_engagements set fee_status = 'refunded'
    where id = a.engagement_id
      and app.refunded_so_far(null, id, 'poster') >= poster_fee_cents and app.refunded_so_far(null, id, 'provider') >= provider_fee_cents;
  end if;
  perform app.notify_billing(a.organisation_id, 'billing_invoice',
    case a.kind when 'refund' then 'Refund issued: ' else 'Credit added: ' end || to_char(a.amount_cents / 100.0, 'FM$999,990.00'),
    case a.kind when 'refund' then 'HVEMS refunded this to your card. It usually shows within 5 to 10 business days.'
                else 'HVEMS added this credit. It comes off your next invoice.' end);
end $$;

do $do$
declare f text;
begin
  foreach f in array array['public.claim_billing_adjustments(uuid, integer)', 'public.complete_billing_adjustment(uuid, boolean, text, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $do$;

-- The billing dispatch also carries out approved adjustments left over (for example after a network error).
create or replace function app.kick_billing_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.billing_invoices where status = 'draft')
     and not exists (select 1 from public.connection_fee_attempts where needs_stripe_cleanup and not app.fee_attempt_active(state))
     and not exists (select 1 from public.billing_adjustments where status = 'approved'
                     or (status = 'processing' and processing_at < now() - interval '15 minutes')) then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') or not exists (select 1 from pg_namespace where nspname = 'vault') then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'email_dispatch_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 55000)'
    using replace(v_url, '/api/email/dispatch', '/api/billing/dispatch'),
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
end $$;
