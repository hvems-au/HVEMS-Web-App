-- =============================================================================
-- 2C Expenditure (CS-23, spec EXP-01..03; SoW 3.8; posting rules 9.2):
-- * Fuel and usage records: asset, date and time, odometer / hour meter reading,
--   quantity and unit, fuel type, supplier, receipt. The reading is recorded on the
--   equipment (a lower one needs a reason, AST-10). Corrections by amendment with a
--   reason: the original is kept as superseded and its cost reversed.
-- * Cost lines (append-only, one per source): fuel, and on closing a work order its
--   labour (hours × the technician's cost rate) and its other costs (external for
--   vendor jobs). Reopening a closed work order reverses those lines; closing again
--   posts fresh ones (keyed by the closure).
-- * Technician cost rates are readable only by cost readers (assets.costs.view);
--   technicians never see rates, including their own (EXP-03).
-- =============================================================================

alter type public.meter_reading_source add value if not exists 'fuel';

alter table public.cost_lines drop constraint cost_lines_source_type_check;
alter table public.cost_lines add constraint cost_lines_source_type_check
  check (source_type in ('parts_usage', 'fuel_record', 'work_order'));

-- ---------------------------------------------------------------------------
-- Technician cost rates
-- ---------------------------------------------------------------------------
create table public.workforce_cost_rates (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null,
  hourly_rate_cents bigint not null check (hourly_rate_cents >= 0),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, user_id),
  foreign key (organisation_id, user_id) references public.org_memberships (organisation_id, user_id) on delete cascade
);
create index workforce_cost_rates_user_idx on public.workforce_cost_rates (user_id);
create index workforce_cost_rates_updated_by_idx on public.workforce_cost_rates (updated_by);
create trigger audit_workforce_cost_rates after insert or update or delete on public.workforce_cost_rates for each row execute function app.audit_row_change('organisation_id');
alter table public.workforce_cost_rates enable row level security;
revoke all on public.workforce_cost_rates from anon, authenticated;
grant select on public.workforce_cost_rates to authenticated;
create policy workforce_cost_rates_read on public.workforce_cost_rates for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.costs.view'))::uuid[]));

create or replace function public.set_cost_rate(p_organisation_id uuid, p_user_id uuid, p_hourly_rate_cents bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_capability(p_organisation_id, 'workforce.manage');
  perform app.require_capability(p_organisation_id, 'assets.costs.view');
  if p_hourly_rate_cents is null or p_hourly_rate_cents < 0 then
    perform app.raise('invalid_rate', 'Enter an hourly rate');
  end if;
  if not exists (select 1 from public.org_memberships where organisation_id = p_organisation_id and user_id = p_user_id) then
    perform app.raise('not_found', 'Member not found');
  end if;
  insert into public.workforce_cost_rates (organisation_id, user_id, hourly_rate_cents)
  values (p_organisation_id, p_user_id, p_hourly_rate_cents)
  on conflict (organisation_id, user_id) do update set hourly_rate_cents = excluded.hourly_rate_cents, updated_by = auth.uid(), updated_at = now();
end $$;
revoke execute on function public.set_cost_rate(uuid, uuid, bigint) from public, anon;
grant execute on function public.set_cost_rate(uuid, uuid, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fuel and usage records (EXP-02)
-- ---------------------------------------------------------------------------
create table public.fuel_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null,
  filled_at timestamptz not null,
  fuel_type text not null default 'diesel' check (fuel_type in ('diesel', 'unleaded', 'adblue', 'lpg', 'oil', 'other')),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null default 'L' check (unit in ('L', 'kg', 'each')),
  odometer_km numeric(12, 1) check (odometer_km is null or odometer_km >= 0),
  engine_hours numeric(12, 1) check (engine_hours is null or engine_hours >= 0),
  supplier text check (supplier is null or char_length(supplier) <= 160),
  receipt_paths text[] not null default '{}' check (cardinality(receipt_paths) <= 3),
  notes text check (notes is null or char_length(notes) <= 1000),
  client_request_id uuid unique,
  amends_id uuid unique references public.fuel_records (id),
  amend_reason text,
  superseded_at timestamptz,
  recorded_by uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id),
  constraint fuel_records_amend_reason check (amends_id is null or char_length(btrim(coalesce(amend_reason, ''))) >= 3)
);
create index fuel_records_asset_idx on public.fuel_records (asset_id, organisation_id, filled_at desc);
create index fuel_records_org_idx on public.fuel_records (organisation_id, filled_at desc);
create index fuel_records_recorded_by_idx on public.fuel_records (recorded_by);
create trigger audit_fuel_records after insert or update or delete on public.fuel_records for each row execute function app.audit_row_change('organisation_id');
alter table public.fuel_records enable row level security;
revoke all on public.fuel_records from anon, authenticated;
grant select on public.fuel_records to authenticated;
-- Visible with the equipment (assets RLS applies inside the subquery).
create policy fuel_records_read on public.fuel_records for select to authenticated using (
  exists (select 1 from public.assets a where a.id = fuel_records.asset_id));

-- Record (or amend) a fuel fill. The cost goes to cost_lines only (cost readers see it).
create or replace function public.record_fuel(
  p_asset_id uuid,
  p_filled_at timestamptz,
  p_quantity numeric,
  p_fuel_type text default 'diesel',
  p_unit text default 'L',
  p_cost_cents bigint default null,
  p_gst_included boolean default true,
  p_supplier text default null,
  p_odometer_km numeric default null,
  p_engine_hours numeric default null,
  p_lower_reason text default null,
  p_confirm_jump boolean default false,
  p_receipt_paths text[] default '{}'::text[],
  p_notes text default null,
  p_client_request_id uuid default null,
  p_amends_id uuid default null,
  p_amend_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  old public.fuel_records%rowtype;
  oldcost public.cost_lines%rowtype;
  v_id uuid;
  v_existing uuid;
  v_at timestamptz := coalesce(p_filled_at, now());
begin
  select * into a from public.assets where id = p_asset_id;
  if a.id is null then
    perform app.raise('not_found', 'Equipment not found');
  end if;
  perform app.require_capability(a.organisation_id, 'meter_readings.record');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not permitted to operate this equipment');
  end if;
  if a.archived_at is not null then
    perform app.raise('asset_archived', 'Fuel can''t be recorded for archived equipment');
  end if;
  if p_client_request_id is not null then
    select id into v_existing from public.fuel_records where client_request_id = p_client_request_id;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;
  if p_quantity is null or p_quantity <= 0 then
    perform app.raise('quantity_required', 'Enter the quantity');
  end if;
  if p_cost_cents is not null and p_cost_cents < 0 then
    perform app.raise('invalid_cost', 'The cost can''t be negative');
  end if;
  perform app.check_evidence(a.organisation_id, a.id, p_receipt_paths);
  if p_amends_id is not null then
    perform app.require_capability(a.organisation_id, 'meter_readings.accept');
    select * into old from public.fuel_records where id = p_amends_id and asset_id = a.id for update;
    if old.id is null or old.superseded_at is not null then
      perform app.raise('not_found', 'The record being corrected was not found');
    end if;
    if char_length(btrim(coalesce(p_amend_reason, ''))) < 3 then
      perform app.raise('reason_required', 'Say why it is being corrected');
    end if;
  else
    -- New fills record their readings on the equipment (corrections don't re-record).
    if p_odometer_km is not null then
      perform public.record_meter_reading(a.id, 'km', p_odometer_km, v_at, 'fuel', null, p_lower_reason, p_confirm_jump);
    end if;
    if p_engine_hours is not null then
      perform public.record_meter_reading(a.id, 'hours', p_engine_hours, v_at, 'fuel', null, p_lower_reason, p_confirm_jump);
    end if;
  end if;

  insert into public.fuel_records (organisation_id, asset_id, filled_at, fuel_type, quantity, unit, odometer_km, engine_hours, supplier,
    receipt_paths, notes, client_request_id, amends_id, amend_reason)
  values (a.organisation_id, a.id, v_at, coalesce(p_fuel_type, 'diesel'), p_quantity, coalesce(p_unit, 'L'), p_odometer_km, p_engine_hours,
    nullif(btrim(coalesce(p_supplier, '')), ''), coalesce(p_receipt_paths, '{}'), nullif(btrim(coalesce(p_notes, '')), ''),
    p_client_request_id, p_amends_id, nullif(btrim(coalesce(p_amend_reason, '')), ''))
  returning id into v_id;

  if old.id is not null then
    update public.fuel_records set superseded_at = now() where id = old.id;
    select * into oldcost from public.cost_lines where source_type = 'fuel_record' and source_id = old.id;
    if oldcost.id is not null then
      insert into public.cost_lines (organisation_id, source_type, source_id, kind, asset_id, description, amount_cents, gst_included, reverses_id, created_by)
      values (oldcost.organisation_id, 'fuel_record', md5(old.id::text || ':reversal')::uuid, 'fuel', oldcost.asset_id, 'Correction: ' || oldcost.description,
              -oldcost.amount_cents, oldcost.gst_included, oldcost.id, auth.uid());
    end if;
  end if;
  if p_cost_cents is not null then
    insert into public.cost_lines (organisation_id, source_type, source_id, kind, asset_id, description, amount_cents, gst_included, created_by)
    values (a.organisation_id, 'fuel_record', v_id, 'fuel', a.id,
            format('%s %s %s%s', trim(to_char(p_quantity, 'FM999G999G990D00')), coalesce(p_unit, 'L'), coalesce(p_fuel_type, 'diesel'),
                   case when p_supplier is not null then ' · ' || btrim(p_supplier) else '' end),
            p_cost_cents, coalesce(p_gst_included, true), auth.uid());
  end if;
  return v_id;
end $$;
revoke execute on function public.record_fuel(uuid, timestamptz, numeric, text, text, bigint, boolean, text, numeric, numeric, text, boolean, text[], text, uuid, uuid, text) from public, anon;
grant execute on function public.record_fuel(uuid, timestamptz, numeric, text, text, bigint, boolean, text, numeric, numeric, text, boolean, text[], text, uuid, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Work order costs on close; reversed on reopen (EXP-01, 9.2)
-- ---------------------------------------------------------------------------
create or replace function app.work_orders_post_costs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rate bigint;
  v_worker uuid := coalesce(new.completed_by, new.assigned_to);
  v_ref text := 'WO-' || lpad(new.number::text, 4, '0');
  c record;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if coalesce(new.labour_hours, 0) > 0 and new.kind = 'internal' and v_worker is not null then
      select hourly_rate_cents into v_rate from public.workforce_cost_rates where organisation_id = new.organisation_id and user_id = v_worker;
      if v_rate is not null then
        insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, created_by)
        values (new.organisation_id, 'work_order', md5(new.id::text || ':labour:' || new.reopen_count)::uuid, 'labour', new.id, new.asset_id,
                format('%s labour: %s h', v_ref, trim(to_char(new.labour_hours, 'FM999G990D00'))), round(new.labour_hours * v_rate)::bigint, auth.uid())
        on conflict (source_type, source_id) do nothing;
      end if;
    end if;
    if coalesce(new.cost_cents, 0) > 0 then
      insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, created_by)
      values (new.organisation_id, 'work_order', md5(new.id::text || ':other:' || new.reopen_count)::uuid,
              case when new.kind = 'vendor' then 'external' else 'other' end, new.id, new.asset_id,
              format('%s %s', v_ref, case when new.kind = 'vendor' then 'vendor: ' || coalesce(new.vendor_name, '') else 'other costs' end), new.cost_cents, auth.uid())
      on conflict (source_type, source_id) do nothing;
    end if;
  elsif old.status = 'closed' and new.status is distinct from 'closed' then
    -- Reopened: reverse what the closure posted (lines keyed by the previous closure).
    for c in select * from public.cost_lines
             where source_type = 'work_order' and work_order_id = new.id and reverses_id is null and amount_cents > 0
               and source_id in (md5(new.id::text || ':labour:' || old.reopen_count)::uuid, md5(new.id::text || ':other:' || old.reopen_count)::uuid) loop
      insert into public.cost_lines (organisation_id, source_type, source_id, kind, work_order_id, asset_id, description, amount_cents, reverses_id, created_by)
      values (c.organisation_id, 'work_order', md5(c.id::text || ':reversal')::uuid, c.kind, c.work_order_id, c.asset_id, 'Reopened: ' || c.description,
              -c.amount_cents, c.id, auth.uid())
      on conflict (source_type, source_id) do nothing;
    end loop;
  end if;
  return null;
end $$;
create trigger work_orders_post_costs after update on public.work_orders for each row execute function app.work_orders_post_costs();
