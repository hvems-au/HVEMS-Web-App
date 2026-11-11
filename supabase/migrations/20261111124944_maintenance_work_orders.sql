-- 2C Maintenance, slice 1: service plans, schedule and work orders (CS-17, CS-18).
-- * Service plans repeat every N days and/or N kilometres and/or N hours. Next
--   due comes from the last service and the latest accepted odometer / hour
--   meter readings. Overdue / due soon thresholds are settings.
-- * An overdue plan opens an 'overdue_service' condition cause (Needs attention
--   only where the company turned that rule on); it is resolved when the plan
--   is no longer overdue. Work orders never clear safety causes (ADR-005).
-- * Work orders: WO-0001…, internal or a named vendor, assigned to a member.
--   Open → In progress → Completed (technician) → Closed (manager review);
--   Reopen with a reason; Cancel. Closing one linked to a service plan records
--   the service as done. Money in AUD cents. Everything audited.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('maintenance.due_soon_days', '14', 'Days before a service is due that it shows as due soon', 'recommended', 'CS-17'),
  ('maintenance.due_soon_km', '1000', 'Kilometres before a service is due that it shows as due soon', 'recommended', 'CS-17'),
  ('maintenance.due_soon_hours', '50', 'Hours before a service is due that it shows as due soon', 'recommended', 'CS-17')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Service plans
-- ---------------------------------------------------------------------------
create table public.service_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  interval_days integer check (interval_days is null or interval_days between 1 and 3650),
  interval_km numeric(10, 1) check (interval_km is null or interval_km > 0),
  interval_hours numeric(10, 1) check (interval_hours is null or interval_hours > 0),
  last_done_on date,
  last_done_km numeric(12, 1) check (last_done_km is null or last_done_km >= 0),
  last_done_hours numeric(12, 1) check (last_done_hours is null or last_done_hours >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade,
  constraint service_plans_has_interval check (coalesce(interval_days, 0) > 0 or coalesce(interval_km, 0) > 0 or coalesce(interval_hours, 0) > 0)
);
create index service_plans_org_idx on public.service_plans (organisation_id) where active;
create index service_plans_asset_org_idx on public.service_plans (asset_id, organisation_id);
create index service_plans_created_by_idx on public.service_plans (created_by);
create trigger service_plans_updated_at before update on public.service_plans for each row execute function app.set_updated_at();
create trigger audit_service_plans after insert or update or delete on public.service_plans
  for each row execute function app.audit_row_change('organisation_id');

alter table public.service_plans enable row level security;
revoke all on public.service_plans from anon, authenticated;
grant select on public.service_plans to authenticated;
grant insert (organisation_id, asset_id, name, interval_days, interval_km, interval_hours, last_done_on, last_done_km, last_done_hours, notes)
  on public.service_plans to authenticated;
grant update (name, interval_days, interval_km, interval_hours, last_done_on, last_done_km, last_done_hours, notes, active)
  on public.service_plans to authenticated;
create policy service_plans_read on public.service_plans for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.work'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy service_plans_insert on public.service_plans for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[]));
create policy service_plans_update on public.service_plans for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[]));

-- Latest accepted reading for an asset and unit.
create or replace function app.latest_reading(p_asset_id uuid, p_unit public.meter_unit) returns numeric
language sql stable security definer set search_path = '' as $$
  select value from public.meter_readings
  where asset_id = p_asset_id and unit = p_unit and status = 'accepted'
  order by read_at desc, created_at desc limit 1
$$;

create or replace function app.service_status(p_plan_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.service_plans%rowtype;
  v_today date;
  v_km numeric;
  v_hours numeric;
  v_due_on date;
  v_due_km numeric;
  v_due_hours numeric;
begin
  select * into p from public.service_plans where id = p_plan_id;
  if p.id is null or not p.active then
    return null;
  end if;
  select (now() at time zone coalesce(timezone, 'Australia/Brisbane'))::date into v_today from public.organisations where id = p.organisation_id;
  v_km := app.latest_reading(p.asset_id, 'km');
  v_hours := app.latest_reading(p.asset_id, 'hours');
  v_due_on := case when p.interval_days is not null then coalesce(p.last_done_on, p.created_at::date) + p.interval_days end;
  v_due_km := case when p.interval_km is not null then coalesce(p.last_done_km, 0) + p.interval_km end;
  v_due_hours := case when p.interval_hours is not null then coalesce(p.last_done_hours, 0) + p.interval_hours end;
  if (v_due_on is not null and v_today > v_due_on)
     or (v_due_km is not null and v_km is not null and v_km >= v_due_km)
     or (v_due_hours is not null and v_hours is not null and v_hours >= v_due_hours) then
    return 'overdue';
  end if;
  if (v_due_on is not null and v_today >= v_due_on - coalesce(app.setting_int('maintenance.due_soon_days'), 14))
     or (v_due_km is not null and v_km is not null and v_km >= v_due_km - coalesce(app.setting_int('maintenance.due_soon_km'), 1000))
     or (v_due_hours is not null and v_hours is not null and v_hours >= v_due_hours - coalesce(app.setting_int('maintenance.due_soon_hours'), 50)) then
    return 'due_soon';
  end if;
  return 'ok';
end $$;
grant execute on function app.service_status(uuid), app.latest_reading(uuid, public.meter_unit) to authenticated, service_role;

-- The schedule: next due and status for each active plan (read through RLS on service_plans).
create or replace view public.service_schedule with (security_invoker = true) as
select p.id, p.organisation_id, p.asset_id, p.name, p.interval_days, p.interval_km, p.interval_hours,
       p.last_done_on, p.last_done_km, p.last_done_hours, p.notes,
       case when p.interval_days is not null then coalesce(p.last_done_on, p.created_at::date) + p.interval_days end as next_due_on,
       case when p.interval_km is not null then coalesce(p.last_done_km, 0) + p.interval_km end as next_due_km,
       case when p.interval_hours is not null then coalesce(p.last_done_hours, 0) + p.interval_hours end as next_due_hours,
       app.latest_reading(p.asset_id, 'km') as current_km,
       app.latest_reading(p.asset_id, 'hours') as current_hours,
       app.service_status(p.id) as status
from public.service_plans p
where p.active;
grant select on public.service_schedule to authenticated;

-- Keep 'overdue_service' condition causes in step with the schedule (hourly, and after changes).
create or replace function app.sync_overdue_services(p_org uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  -- Open a cause for each overdue plan without one.
  for r in select p.id, p.asset_id from public.service_plans p
           where p.active and (p_org is null or p.organisation_id = p_org) and app.service_status(p.id) = 'overdue'
             and not exists (select 1 from public.asset_condition_causes c where c.source_type = 'service_plan' and c.source_id = p.id and c.resolved_at is null) loop
    perform app.open_condition_cause(r.asset_id, 'overdue_service', 'service_plan', r.id);
    v_n := v_n + 1;
  end loop;
  -- Resolve causes whose plan is no longer overdue (serviced, changed or switched off).
  for r in select c.id from public.asset_condition_causes c
           left join public.service_plans p on p.id = c.source_id
           where c.source_type = 'service_plan' and c.resolved_at is null and (p_org is null or c.organisation_id = p_org)
             and (p.id is null or not p.active or app.service_status(p.id) <> 'overdue') loop
    perform app.resolve_condition_cause(r.id, 'serviced');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function app.sync_overdue_services(uuid) from public, anon, authenticated;

create or replace function app.service_plans_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.sync_overdue_services(coalesce(new.organisation_id, old.organisation_id));
  return null;
end $$;
create trigger service_plans_sync_overdue after insert or update or delete on public.service_plans
  for each row execute function app.service_plans_after_change();

-- ---------------------------------------------------------------------------
-- Work orders
-- ---------------------------------------------------------------------------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  number integer not null check (number > 0),
  asset_id uuid not null,
  service_plan_id uuid,
  defect_id uuid,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text check (description is null or char_length(description) <= 4000),
  kind text not null default 'internal' check (kind in ('internal', 'vendor')),
  vendor_name text check (vendor_name is null or char_length(vendor_name) <= 160),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references auth.users (id) on delete set null,
  due_on date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'closed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completion_notes text check (completion_notes is null or char_length(completion_notes) <= 4000),
  odometer_km numeric(12, 1) check (odometer_km is null or odometer_km >= 0),
  engine_hours numeric(12, 1) check (engine_hours is null or engine_hours >= 0),
  labour_hours numeric(8, 2) check (labour_hours is null or labour_hours >= 0),
  cost_cents bigint check (cost_cents is null or cost_cents >= 0),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  close_note text check (close_note is null or char_length(close_note) <= 2000),
  reopen_count integer not null default 0,
  last_reopen_reason text,
  cancel_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, number),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id),
  foreign key (service_plan_id, organisation_id) references public.service_plans (id, organisation_id) on delete set null (service_plan_id),
  constraint work_orders_vendor_named check (kind <> 'vendor' or vendor_name is not null)
);
create index work_orders_org_status_idx on public.work_orders (organisation_id, status, created_at desc);
create index work_orders_asset_org_idx on public.work_orders (asset_id, organisation_id);
create index work_orders_plan_org_idx on public.work_orders (service_plan_id, organisation_id);
create index work_orders_defect_idx on public.work_orders (defect_id);
create index work_orders_assigned_idx on public.work_orders (assigned_to);
create index work_orders_completed_by_idx on public.work_orders (completed_by);
create index work_orders_closed_by_idx on public.work_orders (closed_by);
create index work_orders_created_by_idx on public.work_orders (created_by);
create trigger work_orders_updated_at before update on public.work_orders for each row execute function app.set_updated_at();
create trigger audit_work_orders after insert or update or delete on public.work_orders
  for each row execute function app.audit_row_change('organisation_id');

alter table public.work_orders enable row level security;
revoke all on public.work_orders from anon, authenticated;
grant select on public.work_orders to authenticated;
create policy work_orders_read on public.work_orders for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.work'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

-- Create (managers).
create or replace function public.create_work_order(
  p_organisation_id uuid, p_asset_id uuid, p_title text, p_description text default null, p_kind text default 'internal',
  p_vendor_name text default null, p_priority text default 'normal', p_assigned_to uuid default null, p_due_on date default null,
  p_service_plan_id uuid default null, p_defect_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_number integer;
  v_id uuid;
begin
  perform app.require_capability(p_organisation_id, 'work_orders.manage');
  if not exists (select 1 from public.assets where id = p_asset_id and organisation_id = p_organisation_id and archived_at is null) then
    perform app.raise('not_found', 'Equipment not found');
  end if;
  if p_assigned_to is not null and not exists (select 1 from public.org_memberships
       where organisation_id = p_organisation_id and user_id = p_assigned_to and status = 'active') then
    perform app.raise('invalid_assignee', 'Assign the work order to a member of this company');
  end if;
  if p_defect_id is not null and not exists (select 1 from public.defects where id = p_defect_id and organisation_id = p_organisation_id and asset_id = p_asset_id) then
    perform app.raise('invalid_defect', 'That defect is not on this equipment');
  end if;
  perform 1 from public.organisations where id = p_organisation_id for update;
  select coalesce(max(number), 0) + 1 into v_number from public.work_orders where organisation_id = p_organisation_id;
  insert into public.work_orders (organisation_id, number, asset_id, service_plan_id, defect_id, title, description, kind, vendor_name,
    priority, assigned_to, due_on, created_by)
  values (p_organisation_id, v_number, p_asset_id, p_service_plan_id, p_defect_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_kind, 'internal'), nullif(btrim(coalesce(p_vendor_name, '')), ''), coalesce(p_priority, 'normal'), p_assigned_to, p_due_on, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'number', v_number);
end $$;

-- Status changes. Technicians (work_orders.work) start and complete; managers review, close, reopen and cancel.
create or replace function public.update_work_order_status(
  p_id uuid, p_action text, p_notes text default null, p_odometer_km numeric default null, p_engine_hours numeric default null,
  p_labour_hours numeric default null, p_cost_cents bigint default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.work_orders%rowtype;
  v_manager boolean;
begin
  select * into w from public.work_orders where id = p_id for update;
  if w.id is null then
    perform app.raise('not_found', 'Work order not found');
  end if;
  v_manager := app.has_capability(w.organisation_id, 'work_orders.manage');
  if not v_manager and not app.has_capability(w.organisation_id, 'work_orders.work') then
    perform app.raise('forbidden', 'You do not have permission to do this');
  end if;

  if p_action = 'start' then
    if w.status <> 'open' then perform app.raise('invalid_status', 'Only an open work order can be started'); end if;
    update public.work_orders set status = 'in_progress', started_at = now(), assigned_to = coalesce(assigned_to, auth.uid()) where id = w.id;
  elsif p_action = 'complete' then
    if w.status not in ('open', 'in_progress') then perform app.raise('invalid_status', 'This work order is not in progress'); end if;
    if char_length(btrim(coalesce(p_notes, ''))) < 3 then perform app.raise('notes_required', 'Describe the work done'); end if;
    update public.work_orders set status = 'completed', completed_at = now(), completed_by = auth.uid(), completion_notes = btrim(p_notes),
      odometer_km = p_odometer_km, engine_hours = p_engine_hours, labour_hours = p_labour_hours, cost_cents = p_cost_cents,
      started_at = coalesce(started_at, now())
    where id = w.id;
  elsif p_action = 'close' then
    if not v_manager then perform app.raise('forbidden', 'A manager reviews and closes work orders'); end if;
    if w.status <> 'completed' then perform app.raise('invalid_status', 'Only a completed work order can be closed'); end if;
    update public.work_orders set status = 'closed', closed_at = now(), closed_by = auth.uid(), close_note = nullif(btrim(coalesce(p_notes, '')), '') where id = w.id;
    -- A service work order records the service as done.
    if w.service_plan_id is not null then
      update public.service_plans
      set last_done_on = (coalesce(w.completed_at, now()) at time zone 'Australia/Brisbane')::date,
          last_done_km = coalesce(w.odometer_km, app.latest_reading(w.asset_id, 'km'), last_done_km),
          last_done_hours = coalesce(w.engine_hours, app.latest_reading(w.asset_id, 'hours'), last_done_hours)
      where id = w.service_plan_id;
    end if;
  elsif p_action = 'reopen' then
    if not v_manager then perform app.raise('forbidden', 'A manager reopens work orders'); end if;
    if w.status not in ('completed', 'closed') then perform app.raise('invalid_status', 'Only a completed or closed work order can be reopened'); end if;
    if char_length(btrim(coalesce(p_notes, ''))) < 3 then perform app.raise('reason_required', 'Give a reason for reopening'); end if;
    update public.work_orders set status = 'in_progress', closed_at = null, closed_by = null, reopen_count = reopen_count + 1,
      last_reopen_reason = btrim(p_notes) where id = w.id;
  elsif p_action = 'cancel' then
    if not v_manager then perform app.raise('forbidden', 'A manager cancels work orders'); end if;
    if w.status in ('closed', 'cancelled') then perform app.raise('invalid_status', 'This work order is already finished'); end if;
    if char_length(btrim(coalesce(p_notes, ''))) < 3 then perform app.raise('reason_required', 'Give a reason for cancelling'); end if;
    update public.work_orders set status = 'cancelled', cancel_reason = btrim(p_notes) where id = w.id;
  else
    perform app.raise('invalid_action', 'Unknown action');
  end if;
end $$;

-- Managers change the details of an unfinished work order.
create or replace function public.update_work_order(
  p_id uuid, p_title text, p_description text, p_kind text, p_vendor_name text, p_priority text, p_assigned_to uuid, p_due_on date
) returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.work_orders%rowtype;
begin
  select * into w from public.work_orders where id = p_id for update;
  if w.id is null then perform app.raise('not_found', 'Work order not found'); end if;
  perform app.require_capability(w.organisation_id, 'work_orders.manage');
  if w.status in ('closed', 'cancelled') then perform app.raise('invalid_status', 'Reopen the work order to change it'); end if;
  if p_assigned_to is not null and not exists (select 1 from public.org_memberships
       where organisation_id = w.organisation_id and user_id = p_assigned_to and status = 'active') then
    perform app.raise('invalid_assignee', 'Assign the work order to a member of this company');
  end if;
  update public.work_orders set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''), kind = p_kind,
    vendor_name = nullif(btrim(coalesce(p_vendor_name, '')), ''), priority = p_priority, assigned_to = p_assigned_to, due_on = p_due_on
  where id = w.id;
end $$;

revoke execute on function public.create_work_order(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid),
  public.update_work_order_status(uuid, text, text, numeric, numeric, numeric, bigint),
  public.update_work_order(uuid, text, text, text, text, text, uuid, date) from public, anon;
grant execute on function public.create_work_order(uuid, uuid, text, text, text, text, text, uuid, date, uuid, uuid),
  public.update_work_order_status(uuid, text, text, numeric, numeric, numeric, bigint),
  public.update_work_order(uuid, text, text, text, text, text, uuid, date) to authenticated, service_role;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('hvems-overdue-services', '15 * * * *', 'select app.sync_overdue_services()');
  end if;
end $do$;
