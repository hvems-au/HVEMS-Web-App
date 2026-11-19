-- =============================================================================
-- 2C Parts: requests → approval → purchasing → receiving → usage (CS-20,
-- spec PRT-01..07, state machine 7.7, transactions 9.1/9.2).
-- * Suppliers and a parts catalogue for quick entry (PRT-06/07).
-- * Requests with several lines, linked to equipment and optionally a work order,
--   with urgency, needed-by date and delivery site (PRT-01). Lines can carry photos.
-- * One approval level by Approval Limit (PRT-02): within the requester's limit it
--   is approved automatically (recorded); otherwise members with a high enough
--   limit are alerted and approve, or reject with a reason. The Owner has no limit.
-- * Orders per line (supplier, reference, dates, actual unit cost) by Fleet
--   Managers and above (parts.manage). More than 10% over the approved price sends
--   the request back for approval (PRT-03).
-- * Receiving with partial deliveries, delivery notes, substitutes and returns to
--   the supplier (reasons required) (PRT-04).
-- * Fitting to a work order from received lines or bought on the spot; each fit
--   posts one cost line, a return writes a reversing line (PRT-05, 9.2).
-- * Technicians see requests and estimates but never actual prices or cost
--   lines (those need assets.costs.view).
-- Nothing is deleted: lines are removed by marking them, cost lines are append-only.
-- =============================================================================

-- BEGIN CAPABILITY SEED (matrix.ts mirror; the drift test reads every migration)
insert into app.role_capabilities (role, capability) values
  ('owner', 'parts.manage'),
  ('administrator', 'parts.manage'),
  ('fleet_manager', 'parts.manage')
on conflict do nothing;
-- END CAPABILITY SEED

-- Who can see parts records at all.
create or replace function app.parts_reader_orgs() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array(
    select unnest(app.orgs_with_capability('parts.request'))
    union select unnest(app.orgs_with_capability('parts.approve'))
    union select unnest(app.orgs_with_capability('parts.manage'))
    union select unnest(app.orgs_with_capability('assets.costs.view')))
$$;
grant execute on function app.parts_reader_orgs() to authenticated, service_role;

-- A member's approval limit in cents: the Owner has no limit; otherwise the
-- active Approval Limit grant (null when they have none).
create or replace function app.approval_limit_cents(p_org uuid, p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.org_memberships m where m.organisation_id = p_org and m.user_id = p_user and m.status = 'active'
                 and 'owner' = any (app.membership_roles(m))) then 9000000000000000
    else (select max(g.approval_limit_cents) from public.membership_grants g
          join public.org_memberships m on m.id = g.membership_id and m.organisation_id = g.organisation_id
          where g.organisation_id = p_org and m.user_id = p_user and m.status = 'active'
            and g.grant_type = 'approval_limit' and g.revoked_at is null)
  end
$$;
grant execute on function app.approval_limit_cents(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Suppliers and catalogue (PRT-06, PRT-07)
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  abn text check (abn is null or abn ~ '^[0-9]{11}$'),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or (char_length(phone) <= 40 and phone ~ '^[0-9 +()-]+$')),
  account_number text check (account_number is null or char_length(account_number) <= 60),
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);
create index suppliers_org_idx on public.suppliers (organisation_id);
create index suppliers_created_by_idx on public.suppliers (created_by);
create trigger suppliers_updated_at before update on public.suppliers for each row execute function app.set_updated_at();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function app.audit_row_change('organisation_id');
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;
create policy suppliers_read on public.suppliers for select to authenticated using (organisation_id = any ((select app.parts_reader_orgs())::uuid[]));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('parts.manage'))::uuid[]));
create policy suppliers_update on public.suppliers for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('parts.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('parts.manage'))::uuid[]));

create table public.parts_catalogue (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  part_number text check (part_number is null or char_length(part_number) <= 80),
  description text not null check (char_length(btrim(description)) between 2 and 200),
  unit text not null default 'each' check (char_length(btrim(unit)) between 1 and 20),
  default_unit_cost_cents bigint check (default_unit_cost_cents is null or default_unit_cost_cents >= 0),
  supplier_id uuid,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (supplier_id, organisation_id) references public.suppliers (id, organisation_id)
);
create index parts_catalogue_org_idx on public.parts_catalogue (organisation_id);
create index parts_catalogue_supplier_idx on public.parts_catalogue (supplier_id, organisation_id);
create index parts_catalogue_created_by_idx on public.parts_catalogue (created_by);
create trigger parts_catalogue_updated_at before update on public.parts_catalogue for each row execute function app.set_updated_at();
create trigger audit_parts_catalogue after insert or update or delete on public.parts_catalogue for each row execute function app.audit_row_change('organisation_id');
alter table public.parts_catalogue enable row level security;
revoke all on public.parts_catalogue from anon, authenticated;
grant select, insert, update on public.parts_catalogue to authenticated;
create policy parts_catalogue_read on public.parts_catalogue for select to authenticated using (organisation_id = any ((select app.parts_reader_orgs())::uuid[]));
create policy parts_catalogue_insert on public.parts_catalogue for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('parts.manage'))::uuid[]));
create policy parts_catalogue_update on public.parts_catalogue for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('parts.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('parts.manage'))::uuid[]));

-- ---------------------------------------------------------------------------
-- Requests and lines (PRT-01)
-- ---------------------------------------------------------------------------
create table public.parts_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  number integer not null check (number > 0),
  asset_id uuid not null,
  work_order_id uuid,
  site_id uuid,
  urgency text not null default 'normal' check (urgency in ('normal', 'urgent')),
  needed_by date,
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'ordered', 'partially_received', 'received', 'closed', 'cancelled')),
  requested_by uuid not null references auth.users (id),
  submitted_at timestamptz,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  auto_approved boolean not null default false,
  reapproval_reason text,
  reject_reason text,
  cancel_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, number),
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id),
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id),
  foreign key (site_id, organisation_id) references public.sites (id, organisation_id)
);
create index parts_requests_org_status_idx on public.parts_requests (organisation_id, status, created_at desc);
create index parts_requests_asset_idx on public.parts_requests (asset_id, organisation_id);
create index parts_requests_wo_idx on public.parts_requests (work_order_id, organisation_id);
create index parts_requests_site_idx on public.parts_requests (site_id, organisation_id);
create index parts_requests_requested_by_idx on public.parts_requests (requested_by);
create index parts_requests_decided_by_idx on public.parts_requests (decided_by);
create trigger parts_requests_updated_at before update on public.parts_requests for each row execute function app.set_updated_at();
create trigger audit_parts_requests after insert or update or delete on public.parts_requests for each row execute function app.audit_row_change('organisation_id');
alter table public.parts_requests enable row level security;
revoke all on public.parts_requests from anon, authenticated;
grant select on public.parts_requests to authenticated;
create policy parts_requests_read on public.parts_requests for select to authenticated using (
  organisation_id = any ((select app.parts_reader_orgs())::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

create table public.parts_request_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  request_id uuid not null,
  line_no integer not null check (line_no > 0),
  catalogue_id uuid,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  part_number text check (part_number is null or char_length(part_number) <= 80),
  specification text check (specification is null or char_length(specification) <= 1000),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null default 'each' check (char_length(btrim(unit)) between 1 and 20),
  est_unit_cost_cents bigint not null check (est_unit_cost_cents >= 0),
  preferred_supplier_id uuid,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 5),
  -- Order (PRT-03); the actual price is in parts_line_prices (cost readers only).
  supplier_id uuid,
  order_ref text check (order_ref is null or char_length(order_ref) <= 80),
  ordered_on date,
  expected_on date,
  ordered_by uuid references auth.users (id),
  -- Quantities (receipts and fitting keep these in step).
  received_qty numeric(12, 2) not null default 0 check (received_qty >= 0),
  returned_to_supplier_qty numeric(12, 2) not null default 0 check (returned_to_supplier_qty >= 0),
  fitted_qty numeric(12, 2) not null default 0 check (fitted_qty >= 0),
  cancelled_at timestamptz,
  cancel_reason text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (request_id, organisation_id) references public.parts_requests (id, organisation_id) on delete cascade,
  foreign key (catalogue_id, organisation_id) references public.parts_catalogue (id, organisation_id),
  foreign key (preferred_supplier_id, organisation_id) references public.suppliers (id, organisation_id),
  foreign key (supplier_id, organisation_id) references public.suppliers (id, organisation_id)
);
create index parts_request_lines_request_idx on public.parts_request_lines (request_id, organisation_id);
create index parts_request_lines_org_idx on public.parts_request_lines (organisation_id);
create index parts_request_lines_catalogue_idx on public.parts_request_lines (catalogue_id, organisation_id);
create index parts_request_lines_pref_supplier_idx on public.parts_request_lines (preferred_supplier_id, organisation_id);
create index parts_request_lines_supplier_idx on public.parts_request_lines (supplier_id, organisation_id);
create index parts_request_lines_ordered_by_idx on public.parts_request_lines (ordered_by);
create trigger audit_parts_request_lines after insert or update or delete on public.parts_request_lines for each row execute function app.audit_row_change('organisation_id');
alter table public.parts_request_lines enable row level security;
revoke all on public.parts_request_lines from anon, authenticated;
grant select on public.parts_request_lines to authenticated;
create policy parts_request_lines_read on public.parts_request_lines for select to authenticated using (
  organisation_id = any ((select app.parts_reader_orgs())::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

-- Actual and approved prices: cost readers only (technicians never see prices paid).
create table public.parts_line_prices (
  line_id uuid primary key,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  approved_unit_cost_cents bigint check (approved_unit_cost_cents is null or approved_unit_cost_cents >= 0),
  actual_unit_cost_cents bigint check (actual_unit_cost_cents is null or actual_unit_cost_cents >= 0),
  foreign key (line_id, organisation_id) references public.parts_request_lines (id, organisation_id) on delete cascade
);
create index parts_line_prices_org_idx on public.parts_line_prices (organisation_id);
create trigger audit_parts_line_prices after insert or update or delete on public.parts_line_prices for each row execute function app.audit_row_change('organisation_id');
alter table public.parts_line_prices enable row level security;
revoke all on public.parts_line_prices from anon, authenticated;
grant select on public.parts_line_prices to authenticated;
create policy parts_line_prices_read on public.parts_line_prices for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.costs.view'))::uuid[]));

-- Receipts and returns to the supplier (PRT-04). Receipts carry no cost.
create table public.parts_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  line_id uuid not null,
  kind text not null check (kind in ('receipt', 'return_to_supplier')),
  quantity numeric(12, 2) not null check (quantity > 0),
  received_on date not null,
  substitute_reason text check (substitute_reason is null or char_length(substitute_reason) <= 1000),
  return_reason text check (return_reason is null or char_length(return_reason) <= 1000),
  note_paths text[] not null default '{}' check (cardinality(note_paths) <= 5),
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (line_id, organisation_id) references public.parts_request_lines (id, organisation_id) on delete cascade,
  constraint parts_receipts_return_reason check (kind <> 'return_to_supplier' or char_length(btrim(coalesce(return_reason, ''))) >= 3)
);
create index parts_receipts_line_idx on public.parts_receipts (line_id, organisation_id);
create index parts_receipts_org_idx on public.parts_receipts (organisation_id);
create index parts_receipts_recorded_by_idx on public.parts_receipts (recorded_by);
create trigger audit_parts_receipts after insert or update or delete on public.parts_receipts for each row execute function app.audit_row_change('organisation_id');
alter table public.parts_receipts enable row level security;
revoke all on public.parts_receipts from anon, authenticated;
grant select on public.parts_receipts to authenticated;
create policy parts_receipts_read on public.parts_receipts for select to authenticated using (organisation_id = any ((select app.parts_reader_orgs())::uuid[]));

-- Parts fitted to a work order (from a request line, or bought on the spot), and
-- returns from the work order (reversing a fit). Costs live in cost_lines.
create table public.parts_usage (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  work_order_id uuid not null,
  asset_id uuid not null,
  line_id uuid,
  kind text not null check (kind in ('fit', 'return')),
  description text not null check (char_length(btrim(description)) between 2 and 200),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null default 'each',
  supplier_name text check (supplier_name is null or char_length(supplier_name) <= 160),
  reverses_id uuid unique references public.parts_usage (id),
  reason text check (reason is null or char_length(reason) <= 1000),
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id),
  foreign key (line_id, organisation_id) references public.parts_request_lines (id, organisation_id),
  constraint parts_usage_return check ((kind = 'return') = (reverses_id is not null)),
  constraint parts_usage_return_reason check (kind <> 'return' or char_length(btrim(coalesce(reason, ''))) >= 3)
);
create index parts_usage_wo_idx on public.parts_usage (work_order_id, organisation_id);
create index parts_usage_asset_idx on public.parts_usage (asset_id, organisation_id);
create index parts_usage_line_idx on public.parts_usage (line_id, organisation_id);
create index parts_usage_org_idx on public.parts_usage (organisation_id);
create index parts_usage_recorded_by_idx on public.parts_usage (recorded_by);
create trigger audit_parts_usage after insert or update or delete on public.parts_usage for each row execute function app.audit_row_change('organisation_id');
alter table public.parts_usage enable row level security;
revoke all on public.parts_usage from anon, authenticated;
grant select on public.parts_usage to authenticated;
create policy parts_usage_read on public.parts_usage for select to authenticated using (
  organisation_id = any ((select app.parts_reader_orgs())::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.work'))::uuid[]));

-- Cost lines (spec 9.2): one per cost-bearing source, reversals reference the
-- original, never edited. Readers need assets.costs.view.
create table public.cost_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  source_type text not null check (source_type in ('parts_usage')),
  source_id uuid not null,
  kind text not null check (kind in ('parts', 'labour', 'external', 'fuel', 'other')),
  work_order_id uuid,
  asset_id uuid,
  description text not null,
  amount_cents bigint not null,
  gst_included boolean not null default true,
  reverses_id uuid unique references public.cost_lines (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id),
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index cost_lines_org_idx on public.cost_lines (organisation_id, created_at desc);
create index cost_lines_wo_idx on public.cost_lines (work_order_id, organisation_id);
create index cost_lines_asset_idx on public.cost_lines (asset_id, organisation_id);
create index cost_lines_created_by_idx on public.cost_lines (created_by);
create trigger audit_cost_lines after insert or update or delete on public.cost_lines for each row execute function app.audit_row_change('organisation_id');
create or replace function app.cost_lines_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform app.raise('append_only', 'Cost lines are never changed; record a reversal instead');
  return null;
end $$;
create trigger cost_lines_append_only before update or delete on public.cost_lines for each row execute function app.cost_lines_append_only();
alter table public.cost_lines enable row level security;
revoke all on public.cost_lines from anon, authenticated;
grant select on public.cost_lines to authenticated;
create policy cost_lines_read on public.cost_lines for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.costs.view'))::uuid[]));

-- ---------------------------------------------------------------------------
-- Notifications for approvals and decisions
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed', 'meter_reading_review', 'parts_approval', 'parts_decision'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The request's total at the price that counts for approval: approved or actual
-- price where recorded, otherwise the estimate.
create or replace function app.parts_request_total_cents(p_request uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(round(l.quantity * coalesce(p.actual_unit_cost_cents, l.est_unit_cost_cents))), 0)::bigint
  from public.parts_request_lines l
  left join public.parts_line_prices p on p.line_id = l.id
  where l.request_id = p_request and l.removed_at is null and l.cancelled_at is null
$$;

-- Send a request for approval to every member whose limit covers it.
create or replace function app.parts_route_for_approval(r public.parts_requests, p_total bigint, p_why text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_asset text;
begin
  select asset_number into v_asset from public.assets where id = r.asset_id;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, asset_id)
  select r.organisation_id, m.user_id, 'parts_approval',
         format('Parts request PR-%s (%s) needs approval', lpad(r.number::text, 4, '0'), v_asset),
         format('%s Total $%s. Open Parts to approve or reject it.', p_why, to_char(p_total / 100.0, 'FM999G999G990D00')),
         r.asset_id
  from public.org_memberships m
  where m.organisation_id = r.organisation_id and m.status = 'active'
    and coalesce(app.approval_limit_cents(r.organisation_id, m.user_id), -1) >= p_total
    and m.user_id <> r.requested_by;
end $$;

create or replace function app.parts_refresh_status(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.parts_requests%rowtype;
  v_lines integer;
  v_received integer;
  v_any_received boolean;
  v_done integer;
  v_any_ordered boolean;
begin
  select * into r from public.parts_requests where id = p_request for update;
  if r.status not in ('approved', 'ordered', 'partially_received', 'received') then
    return;
  end if;
  select count(*),
         count(*) filter (where received_qty - returned_to_supplier_qty >= quantity),
         bool_or(received_qty > 0),
         count(*) filter (where fitted_qty + returned_to_supplier_qty >= quantity),
         bool_or(ordered_on is not null)
    into v_lines, v_received, v_any_received, v_done, v_any_ordered
  from public.parts_request_lines where request_id = p_request and removed_at is null and cancelled_at is null;
  if v_lines = 0 then
    return;
  end if;
  update public.parts_requests set status = case
      when v_done = v_lines then 'closed'
      when v_received = v_lines then 'received'
      when v_any_received then 'partially_received'
      when v_any_ordered then 'ordered'
      else 'approved' end,
    closed_at = case when v_done = v_lines then coalesce(closed_at, now()) else closed_at end
  where id = p_request;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Create or update a draft (requester or parts.manage). p_lines: [{description,
-- part_number, specification, quantity, unit, est_unit_cost_cents, catalogue_id,
-- preferred_supplier_id, photo_paths}]. Saving replaces the draft's lines.
create or replace function public.save_parts_request(
  p_organisation_id uuid,
  p_request_id uuid,
  p_asset_id uuid,
  p_work_order_id uuid,
  p_urgency text,
  p_needed_by date,
  p_site_id uuid,
  p_notes text,
  p_lines jsonb,
  p_submit boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.parts_requests%rowtype;
  a public.assets%rowtype;
  w public.work_orders%rowtype;
  v_id uuid := p_request_id;
  v_number integer;
  l jsonb;
  v_no integer := 0;
  v_photos text[];
begin
  perform app.require_capability(p_organisation_id, 'parts.request');
  select * into a from public.assets where id = p_asset_id and organisation_id = p_organisation_id;
  if a.id is null then
    perform app.raise('asset_required', 'Choose the equipment the parts are for');
  end if;
  if p_work_order_id is not null then
    select * into w from public.work_orders where id = p_work_order_id and organisation_id = p_organisation_id;
    if w.id is null or w.asset_id <> a.id then
      perform app.raise('invalid_work_order', 'The work order must be for the same equipment');
    end if;
  end if;
  if coalesce(p_urgency, 'normal') not in ('normal', 'urgent') then
    perform app.raise('invalid_urgency', 'Urgency must be normal or urgent');
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 50 then
    perform app.raise('invalid_lines', 'Add up to 50 lines');
  end if;

  if v_id is null then
    perform pg_advisory_xact_lock(hashtext('parts_requests:' || p_organisation_id::text));
    select coalesce(max(number), 0) + 1 into v_number from public.parts_requests where organisation_id = p_organisation_id;
    insert into public.parts_requests (organisation_id, number, asset_id, work_order_id, site_id, urgency, needed_by, notes, requested_by)
    values (p_organisation_id, v_number, a.id, p_work_order_id, p_site_id, coalesce(p_urgency, 'normal'), p_needed_by,
            nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
    returning id into v_id;
  else
    select * into r from public.parts_requests where id = v_id and organisation_id = p_organisation_id for update;
    if r.id is null then
      perform app.raise('not_found', 'Parts request not found');
    end if;
    if r.status <> 'draft' then
      perform app.raise('invalid_status', 'Only a draft can be changed');
    end if;
    if r.requested_by <> auth.uid() and not app.has_capability(p_organisation_id, 'parts.manage') then
      perform app.raise('forbidden', 'Only the requester can change this draft');
    end if;
    update public.parts_requests set asset_id = a.id, work_order_id = p_work_order_id, site_id = p_site_id,
      urgency = coalesce(p_urgency, 'normal'), needed_by = p_needed_by, notes = nullif(btrim(coalesce(p_notes, '')), '')
    where id = v_id;
    update public.parts_request_lines set removed_at = now() where request_id = v_id and removed_at is null;
  end if;

  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_no := v_no + 1;
    v_photos := array(select jsonb_array_elements_text(coalesce(l -> 'photo_paths', '[]'::jsonb)));
    perform app.check_evidence(p_organisation_id, a.id, v_photos);
    insert into public.parts_request_lines (organisation_id, request_id, line_no, catalogue_id, description, part_number, specification,
      quantity, unit, est_unit_cost_cents, preferred_supplier_id, photo_paths)
    values (p_organisation_id, v_id, v_no, nullif(l ->> 'catalogue_id', '')::uuid, btrim(coalesce(l ->> 'description', '')),
      nullif(btrim(coalesce(l ->> 'part_number', '')), ''), nullif(btrim(coalesce(l ->> 'specification', '')), ''),
      (l ->> 'quantity')::numeric, coalesce(nullif(btrim(coalesce(l ->> 'unit', '')), ''), 'each'),
      coalesce((l ->> 'est_unit_cost_cents')::bigint, 0), nullif(l ->> 'preferred_supplier_id', '')::uuid, coalesce(v_photos, '{}'));
  end loop;

  if p_submit then
    return public.submit_parts_request(v_id);
  end if;
  return jsonb_build_object('id', v_id, 'status', 'draft');
end $$;

-- Submit: approved automatically within the requester's limit, otherwise routed (PRT-02).
create or replace function public.submit_parts_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.parts_requests%rowtype;
  v_total bigint;
  v_limit bigint;
begin
  select * into r from public.parts_requests where id = p_request_id for update;
  if r.id is null then
    perform app.raise('not_found', 'Parts request not found');
  end if;
  if r.requested_by <> auth.uid() and not app.has_capability(r.organisation_id, 'parts.manage') then
    perform app.raise('forbidden', 'Only the requester can submit this request');
  end if;
  if r.status <> 'draft' then
    perform app.raise('invalid_status', 'This request has already been submitted');
  end if;
  if not exists (select 1 from public.parts_request_lines where request_id = r.id and removed_at is null) then
    perform app.raise('lines_required', 'Add at least one line');
  end if;
  v_total := app.parts_request_total_cents(r.id);
  v_limit := app.approval_limit_cents(r.organisation_id, r.requested_by);
  if v_limit is not null and v_limit >= v_total then
    update public.parts_requests set status = 'approved', submitted_at = now(), decided_by = r.requested_by, decided_at = now(), auto_approved = true
    where id = r.id;
    insert into public.parts_line_prices (line_id, organisation_id, approved_unit_cost_cents)
    select l.id, l.organisation_id, l.est_unit_cost_cents from public.parts_request_lines l where l.request_id = r.id and l.removed_at is null
    on conflict (line_id) do update set approved_unit_cost_cents = excluded.approved_unit_cost_cents;
    return jsonb_build_object('id', r.id, 'status', 'approved', 'auto_approved', true);
  end if;
  update public.parts_requests set status = 'submitted', submitted_at = now() where id = r.id;
  select * into r from public.parts_requests where id = r.id;
  perform app.parts_route_for_approval(r, v_total, 'New request.');
  return jsonb_build_object('id', r.id, 'status', 'submitted', 'auto_approved', false);
end $$;

-- Approve or reject (reason required) by a member whose limit covers the total.
create or replace function public.decide_parts_request(p_request_id uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.parts_requests%rowtype;
  v_total bigint;
  v_asset text;
begin
  select * into r from public.parts_requests where id = p_request_id for update;
  if r.id is null then
    perform app.raise('not_found', 'Parts request not found');
  end if;
  if r.status <> 'submitted' then
    perform app.raise('invalid_status', 'This request is not waiting for approval');
  end if;
  v_total := app.parts_request_total_cents(r.id);
  if coalesce(app.approval_limit_cents(r.organisation_id, auth.uid()), -1) < v_total then
    perform app.raise('limit_too_low', 'Your approval limit is lower than this request');
  end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for rejecting');
  end if;
  if p_approve then
    update public.parts_requests set decided_by = auth.uid(), decided_at = now(), auto_approved = false, reapproval_reason = null, status = 'approved'
    where id = r.id;
    -- The approved price is the one now on file (actual where ordered, otherwise the estimate).
    insert into public.parts_line_prices (line_id, organisation_id, approved_unit_cost_cents)
    select l.id, l.organisation_id, coalesce(p.actual_unit_cost_cents, l.est_unit_cost_cents)
    from public.parts_request_lines l left join public.parts_line_prices p on p.line_id = l.id
    where l.request_id = r.id and l.removed_at is null
    on conflict (line_id) do update set approved_unit_cost_cents = excluded.approved_unit_cost_cents;
    perform app.parts_refresh_status(r.id);
  else
    update public.parts_requests set decided_by = auth.uid(), decided_at = now(), status = 'rejected', reject_reason = btrim(p_reason) where id = r.id;
  end if;
  select asset_number into v_asset from public.assets where id = r.asset_id;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, asset_id)
  values (r.organisation_id, r.requested_by, 'parts_decision',
          format('Parts request PR-%s (%s) %s', lpad(r.number::text, 4, '0'), v_asset, case when p_approve then 'approved' else 'rejected' end),
          case when p_approve then 'It can now be ordered.' else format('Reason: %s', btrim(p_reason)) end, r.asset_id);
end $$;

-- Record the order for a line (parts.manage). More than 10% over the approved
-- price sends the request back for approval (PRT-03).
create or replace function public.record_parts_order(
  p_line_id uuid, p_supplier_id uuid, p_order_ref text, p_ordered_on date, p_expected_on date, p_actual_unit_cost_cents bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.parts_request_lines%rowtype;
  r public.parts_requests%rowtype;
  v_approved bigint;
begin
  select * into l from public.parts_request_lines where id = p_line_id and removed_at is null for update;
  if l.id is null then
    perform app.raise('not_found', 'Line not found');
  end if;
  perform app.require_capability(l.organisation_id, 'parts.manage');
  select * into r from public.parts_requests where id = l.request_id for update;
  if r.status not in ('approved', 'ordered', 'partially_received') or l.cancelled_at is not null then
    perform app.raise('invalid_status', 'Only approved lines can be ordered');
  end if;
  if p_supplier_id is null or not exists (select 1 from public.suppliers where id = p_supplier_id and organisation_id = l.organisation_id) then
    perform app.raise('supplier_required', 'Choose the supplier');
  end if;
  if char_length(btrim(coalesce(p_order_ref, ''))) < 1 then
    perform app.raise('reference_required', 'Enter the order reference');
  end if;
  if p_actual_unit_cost_cents is null or p_actual_unit_cost_cents < 0 then
    perform app.raise('price_required', 'Enter the actual unit price');
  end if;
  update public.parts_request_lines set supplier_id = p_supplier_id, order_ref = btrim(p_order_ref), ordered_on = coalesce(p_ordered_on, current_date),
    expected_on = p_expected_on, ordered_by = auth.uid()
  where id = l.id;
  insert into public.parts_line_prices (line_id, organisation_id, actual_unit_cost_cents)
  values (l.id, l.organisation_id, p_actual_unit_cost_cents)
  on conflict (line_id) do update set actual_unit_cost_cents = excluded.actual_unit_cost_cents;
  select approved_unit_cost_cents into v_approved from public.parts_line_prices where line_id = l.id;
  if p_actual_unit_cost_cents * 10 > coalesce(v_approved, l.est_unit_cost_cents) * 11 then
    update public.parts_requests
    set status = 'submitted', reapproval_reason = format('Line %s costs $%s each, more than 10%% over the approved $%s',
          l.line_no, to_char(p_actual_unit_cost_cents / 100.0, 'FM999G999G990D00'), to_char(coalesce(v_approved, l.est_unit_cost_cents) / 100.0, 'FM999G999G990D00'))
    where id = r.id;
    select * into r from public.parts_requests where id = r.id;
    perform app.parts_route_for_approval(r, app.parts_request_total_cents(r.id), 'The price went up by more than 10%.');
    return jsonb_build_object('reapproval', true);
  end if;
  perform app.parts_refresh_status(r.id);
  return jsonb_build_object('reapproval', false);
end $$;

-- Receive (or return to the supplier) a quantity on a line (parts.manage) (PRT-04).
create or replace function public.receive_parts(
  p_line_id uuid, p_kind text, p_quantity numeric, p_received_on date default null,
  p_substitute_reason text default null, p_return_reason text default null, p_note_paths text[] default '{}'::text[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.parts_request_lines%rowtype;
  r public.parts_requests%rowtype;
  v_outstanding numeric;
  v_on_hand numeric;
begin
  select * into l from public.parts_request_lines where id = p_line_id and removed_at is null for update;
  if l.id is null then
    perform app.raise('not_found', 'Line not found');
  end if;
  perform app.require_capability(l.organisation_id, 'parts.manage');
  select * into r from public.parts_requests where id = l.request_id;
  if r.status not in ('ordered', 'partially_received', 'received') or l.ordered_on is null then
    perform app.raise('invalid_status', 'Record the order before receiving');
  end if;
  if p_quantity is null or p_quantity <= 0 then
    perform app.raise('quantity_required', 'Enter a quantity');
  end if;
  perform app.check_evidence(l.organisation_id, r.asset_id, p_note_paths);
  v_outstanding := l.quantity - (l.received_qty - l.returned_to_supplier_qty);
  v_on_hand := l.received_qty - l.returned_to_supplier_qty - l.fitted_qty;
  if p_kind = 'receipt' then
    if p_quantity > v_outstanding then
      perform app.raise('too_many', format('Only %s still to receive', v_outstanding));
    end if;
    update public.parts_request_lines set received_qty = received_qty + p_quantity where id = l.id;
  elsif p_kind = 'return_to_supplier' then
    if char_length(btrim(coalesce(p_return_reason, ''))) < 3 then
      perform app.raise('reason_required', 'Give a reason for the return');
    end if;
    if p_quantity > v_on_hand then
      perform app.raise('too_many', format('Only %s received and not fitted', v_on_hand));
    end if;
    update public.parts_request_lines set returned_to_supplier_qty = returned_to_supplier_qty + p_quantity where id = l.id;
  else
    perform app.raise('invalid_kind', 'Receive or return');
  end if;
  if p_substitute_reason is not null and char_length(btrim(p_substitute_reason)) < 3 then
    perform app.raise('reason_required', 'Give a reason for the substitute');
  end if;
  insert into public.parts_receipts (organisation_id, line_id, kind, quantity, received_on, substitute_reason, return_reason, note_paths, recorded_by)
  values (l.organisation_id, l.id, p_kind, p_quantity, coalesce(p_received_on, current_date), nullif(btrim(coalesce(p_substitute_reason, '')), ''),
          nullif(btrim(coalesce(p_return_reason, '')), ''), coalesce(p_note_paths, '{}'), auth.uid());
  perform app.parts_refresh_status(r.id);
end $$;

-- Fit parts to a work order (PRT-05): from a received line, or bought on the spot
-- (description, quantity, unit cost). Posts one cost line.
create or replace function public.fit_parts(
  p_work_order_id uuid, p_line_id uuid, p_quantity numeric,
  p_description text default null, p_unit_cost_cents bigint default null, p_supplier_name text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  w public.work_orders%rowtype;
  l public.parts_request_lines%rowtype;
  v_unit bigint;
  v_id uuid;
  v_desc text;
  v_unit_name text := 'each';
begin
  select * into w from public.work_orders where id = p_work_order_id;
  if w.id is null then
    perform app.raise('not_found', 'Work order not found');
  end if;
  perform app.require_job_access(w);
  if w.status in ('closed', 'cancelled') then
    perform app.raise('invalid_status', 'This work order is finished');
  end if;
  if p_quantity is null or p_quantity <= 0 then
    perform app.raise('quantity_required', 'Enter a quantity');
  end if;
  if p_line_id is not null then
    select * into l from public.parts_request_lines where id = p_line_id and organisation_id = w.organisation_id and removed_at is null for update;
    if l.id is null then
      perform app.raise('not_found', 'Line not found');
    end if;
    if p_quantity > l.received_qty - l.returned_to_supplier_qty - l.fitted_qty then
      perform app.raise('too_many', format('Only %s received and not yet fitted', l.received_qty - l.returned_to_supplier_qty - l.fitted_qty));
    end if;
    select coalesce(p.actual_unit_cost_cents, p.approved_unit_cost_cents, l.est_unit_cost_cents) into v_unit
    from public.parts_request_lines x left join public.parts_line_prices p on p.line_id = x.id where x.id = l.id;
    v_desc := l.description;
    v_unit_name := l.unit;
    update public.parts_request_lines set fitted_qty = fitted_qty + p_quantity where id = l.id;
  else
    if char_length(btrim(coalesce(p_description, ''))) < 2 then
      perform app.raise('description_required', 'Describe the part');
    end if;
    if p_unit_cost_cents is null or p_unit_cost_cents < 0 then
      perform app.raise('price_required', 'Enter what it cost');
    end if;
    v_desc := btrim(p_description);
    v_unit := p_unit_cost_cents;
  end if;
  insert into public.parts_usage (organisation_id, work_order_id, asset_id, line_id, kind, description, quantity, unit, supplier_name, recorded_by)
  values (w.organisation_id, w.id, w.asset_id, p_line_id, 'fit', v_desc, p_quantity, v_unit_name, nullif(btrim(coalesce(p_supplier_name, '')), ''), auth.uid())
  returning id into v_id;
  insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, created_by)
  values (w.organisation_id, 'parts_usage', v_id, 'parts', w.id, w.asset_id, format('%s × %s', p_quantity, v_desc), round(p_quantity * v_unit)::bigint, auth.uid());
  if p_line_id is not null then
    perform app.parts_refresh_status(l.request_id);
  end if;
  return v_id;
end $$;

-- Return a fitted part from the work order: reverses its cost line (reason required).
create or replace function public.return_fitted_part(p_usage_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u public.parts_usage%rowtype;
  w public.work_orders%rowtype;
  c public.cost_lines%rowtype;
  v_id uuid;
begin
  select * into u from public.parts_usage where id = p_usage_id and kind = 'fit' for update;
  if u.id is null then
    perform app.raise('not_found', 'Fitted part not found');
  end if;
  select * into w from public.work_orders where id = u.work_order_id;
  perform app.require_job_access(w);
  if exists (select 1 from public.parts_usage where reverses_id = u.id) then
    perform app.raise('already_returned', 'This part has already been returned');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for the return');
  end if;
  insert into public.parts_usage (organisation_id, work_order_id, asset_id, line_id, kind, description, quantity, unit, reverses_id, reason, recorded_by)
  values (u.organisation_id, u.work_order_id, u.asset_id, u.line_id, 'return', u.description, u.quantity, u.unit, u.id, btrim(p_reason), auth.uid())
  returning id into v_id;
  select * into c from public.cost_lines where source_type = 'parts_usage' and source_id = u.id;
  if c.id is not null then
    insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, reverses_id, created_by)
    values (c.organisation_id, 'parts_usage', v_id, c.kind, c.work_order_id, c.asset_id, 'Return: ' || c.description, -c.amount_cents, c.id, auth.uid());
  end if;
  if u.line_id is not null then
    update public.parts_request_lines set fitted_qty = fitted_qty - u.quantity where id = u.line_id;
    perform app.parts_refresh_status((select request_id from public.parts_request_lines where id = u.line_id));
  end if;
  return v_id;
end $$;

-- Cancel a request (requester while draft / submitted / approved, or parts.manage).
create or replace function public.cancel_parts_request(p_request_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.parts_requests%rowtype;
begin
  select * into r from public.parts_requests where id = p_request_id for update;
  if r.id is null then
    perform app.raise('not_found', 'Parts request not found');
  end if;
  if r.status not in ('draft', 'submitted', 'approved') then
    perform app.raise('invalid_status', 'Only a request that hasn''t been ordered can be cancelled');
  end if;
  if r.requested_by <> auth.uid() and not app.has_capability(r.organisation_id, 'parts.manage') then
    perform app.raise('forbidden', 'Only the requester or a manager can cancel this request');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason for cancelling');
  end if;
  update public.parts_requests set status = 'cancelled', cancel_reason = btrim(p_reason) where id = r.id;
end $$;

revoke execute on function
  public.save_parts_request(uuid, uuid, uuid, uuid, text, date, uuid, text, jsonb, boolean),
  public.submit_parts_request(uuid),
  public.decide_parts_request(uuid, boolean, text),
  public.record_parts_order(uuid, uuid, text, date, date, bigint),
  public.receive_parts(uuid, text, numeric, date, text, text, text[]),
  public.fit_parts(uuid, uuid, numeric, text, bigint, text),
  public.return_fitted_part(uuid, text),
  public.cancel_parts_request(uuid, text)
from public, anon;
grant execute on function
  public.save_parts_request(uuid, uuid, uuid, uuid, text, date, uuid, text, jsonb, boolean),
  public.submit_parts_request(uuid),
  public.decide_parts_request(uuid, boolean, text),
  public.record_parts_order(uuid, uuid, text, date, date, bigint),
  public.receive_parts(uuid, text, numeric, date, text, text, text[]),
  public.fit_parts(uuid, uuid, numeric, text, bigint, text),
  public.return_fitted_part(uuid, text),
  public.cancel_parts_request(uuid, text)
to authenticated, service_role;
revoke execute on function app.parts_request_total_cents(uuid), app.parts_route_for_approval(public.parts_requests, bigint, text), app.parts_refresh_status(uuid) from public, anon, authenticated;
