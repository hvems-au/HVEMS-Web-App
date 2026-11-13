-- =============================================================================
-- Technician workspace (13 Nov 2026, Ahmad):
-- * Only people who work on jobs (work_orders.work or work_orders.manage) can be
--   assigned one; a technician starts or completes only their own (or unassigned)
--   jobs. Managers can do any.
-- * Pre-work and post-work reports per work order (checks, notes, photos,
--   readings). A technician can't complete an internal job without both.
-- * Invoices, receipts and other documents on a work order (private bucket
--   work-order-files; money in AUD cents). Removing one marks it removed.
-- * Next service due: the technician proposes it in the post-work report; when
--   the job is closed it becomes the plan's next due (until the next close),
--   and every choice is kept in service_plan_due_history.
-- =============================================================================

-- Who can be given work orders.
create or replace function app.member_can_work_orders(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.org_memberships m
    cross join lateral unnest(app.membership_roles(m)) as r(role)
    join app.role_capabilities rc on rc.role = r.role and rc.capability in ('work_orders.work', 'work_orders.manage')
    where m.organisation_id = p_org and m.user_id = p_user and m.status = 'active')
$$;
revoke execute on function app.member_can_work_orders(uuid, uuid) from public, anon;
grant execute on function app.member_can_work_orders(uuid, uuid) to authenticated, service_role;

alter table public.work_orders add constraint work_orders_id_org_key unique (id, organisation_id);
alter table public.work_orders
  add column next_due_on date,
  add column next_due_km numeric(12, 1) check (next_due_km is null or next_due_km >= 0),
  add column next_due_hours numeric(12, 1) check (next_due_hours is null or next_due_hours >= 0);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.work_order_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  work_order_id uuid not null,
  kind text not null check (kind in ('pre', 'post')),
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  notes text not null check (char_length(btrim(notes)) between 3 and 4000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  odometer_km numeric(12, 1) check (odometer_km is null or odometer_km >= 0),
  engine_hours numeric(12, 1) check (engine_hours is null or engine_hours >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, kind),
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id) on delete cascade
);
create index work_order_reports_org_idx on public.work_order_reports (organisation_id);
create index work_order_reports_created_by_idx on public.work_order_reports (created_by);
create trigger work_order_reports_updated_at before update on public.work_order_reports for each row execute function app.set_updated_at();
create trigger audit_work_order_reports after insert or update or delete on public.work_order_reports
  for each row execute function app.audit_row_change('organisation_id');
alter table public.work_order_reports enable row level security;
revoke all on public.work_order_reports from anon, authenticated;
grant select on public.work_order_reports to authenticated;
create policy work_order_reports_read on public.work_order_reports for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.work'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

-- ---------------------------------------------------------------------------
-- Files (invoices, receipts, quotes, photos, other)
-- ---------------------------------------------------------------------------
create table public.work_order_files (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  work_order_id uuid not null,
  kind text not null check (kind in ('invoice', 'receipt', 'quote', 'photo', 'other')),
  path text not null check (char_length(path) <= 400),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  supplier text check (supplier is null or char_length(supplier) <= 160),
  reference text check (reference is null or char_length(reference) <= 80),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  uploaded_by uuid not null references auth.users (id),
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users (id),
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id) on delete cascade
);
create index work_order_files_wo_idx on public.work_order_files (work_order_id, organisation_id);
create index work_order_files_org_idx on public.work_order_files (organisation_id);
create index work_order_files_uploaded_by_idx on public.work_order_files (uploaded_by);
create index work_order_files_removed_by_idx on public.work_order_files (removed_by);
create trigger audit_work_order_files after insert or update or delete on public.work_order_files
  for each row execute function app.audit_row_change('organisation_id');
alter table public.work_order_files enable row level security;
revoke all on public.work_order_files from anon, authenticated;
grant select on public.work_order_files to authenticated;
create policy work_order_files_read on public.work_order_files for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.work'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

-- ---------------------------------------------------------------------------
-- Next service due (technician's choice, applied when the job is closed)
-- ---------------------------------------------------------------------------
alter table public.service_plans
  add column due_on_set date,
  add column due_km_set numeric(12, 1) check (due_km_set is null or due_km_set >= 0),
  add column due_hours_set numeric(12, 1) check (due_hours_set is null or due_hours_set >= 0);

create table public.service_plan_due_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  service_plan_id uuid not null,
  work_order_id uuid,
  next_due_on date,
  next_due_km numeric(12, 1),
  next_due_hours numeric(12, 1),
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  foreign key (service_plan_id, organisation_id) references public.service_plans (id, organisation_id) on delete cascade,
  foreign key (work_order_id, organisation_id) references public.work_orders (id, organisation_id) on delete set null (work_order_id)
);
create index service_plan_due_history_plan_idx on public.service_plan_due_history (service_plan_id, organisation_id, set_at desc);
create index service_plan_due_history_org_idx on public.service_plan_due_history (organisation_id);
create index service_plan_due_history_wo_idx on public.service_plan_due_history (work_order_id, organisation_id);
create index service_plan_due_history_set_by_idx on public.service_plan_due_history (set_by);
alter table public.service_plan_due_history enable row level security;
revoke all on public.service_plan_due_history from anon, authenticated;
grant select on public.service_plan_due_history to authenticated;
create policy service_plan_due_history_read on public.service_plan_due_history for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.work'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

-- The schedule uses the chosen next due where there is one.
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
  v_due_on := coalesce(p.due_on_set, case when p.interval_days is not null then coalesce(p.last_done_on, p.created_at::date) + p.interval_days end);
  v_due_km := coalesce(p.due_km_set, case when p.interval_km is not null then coalesce(p.last_done_km, 0) + p.interval_km end);
  v_due_hours := coalesce(p.due_hours_set, case when p.interval_hours is not null then coalesce(p.last_done_hours, 0) + p.interval_hours end);
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

create or replace view public.service_schedule with (security_invoker = true) as
select p.id, p.organisation_id, p.asset_id, p.name, p.interval_days, p.interval_km, p.interval_hours,
       p.last_done_on, p.last_done_km, p.last_done_hours, p.notes,
       coalesce(p.due_on_set, case when p.interval_days is not null then coalesce(p.last_done_on, p.created_at::date) + p.interval_days end) as next_due_on,
       coalesce(p.due_km_set, case when p.interval_km is not null then coalesce(p.last_done_km, 0) + p.interval_km end) as next_due_km,
       coalesce(p.due_hours_set, case when p.interval_hours is not null then coalesce(p.last_done_hours, 0) + p.interval_hours end) as next_due_hours,
       app.latest_reading(p.asset_id, 'km') as current_km,
       app.latest_reading(p.asset_id, 'hours') as current_hours,
       app.service_status(p.id) as status,
       (p.due_on_set is not null or p.due_km_set is not null or p.due_hours_set is not null) as next_due_chosen
from public.service_plans p
where p.active;
grant select on public.service_schedule to authenticated;

-- ---------------------------------------------------------------------------
-- Rules on work orders (assignee, who works on it, reports before completing,
-- next due applied on close)
-- ---------------------------------------------------------------------------
create or replace function app.work_orders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not app.member_can_work_orders(new.organisation_id, new.assigned_to) then
    perform app.raise('invalid_assignee', 'Assign it to someone who works on jobs, such as a technician or manager');
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('in_progress', 'completed')
     and auth.uid() is not null and not app.has_capability(new.organisation_id, 'work_orders.manage') then
    if old.assigned_to is not null and old.assigned_to <> auth.uid() then
      perform app.raise('forbidden', 'This job is assigned to someone else');
    end if;
    if new.status = 'completed' and new.kind = 'internal'
       and (select count(*) from public.work_order_reports r where r.work_order_id = new.id) < 2 then
      perform app.raise('reports_required', 'Add the pre-work and post-work reports before completing the job');
    end if;
  end if;
  return new;
end $$;
create trigger work_orders_guard before insert or update on public.work_orders for each row execute function app.work_orders_guard();

create or replace function app.work_orders_apply_next_due() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' and new.service_plan_id is not null then
    update public.service_plans
    set due_on_set = new.next_due_on, due_km_set = new.next_due_km, due_hours_set = new.next_due_hours
    where id = new.service_plan_id;
    if new.next_due_on is not null or new.next_due_km is not null or new.next_due_hours is not null then
      insert into public.service_plan_due_history (organisation_id, service_plan_id, work_order_id, next_due_on, next_due_km, next_due_hours, set_by)
      values (new.organisation_id, new.service_plan_id, new.id, new.next_due_on, new.next_due_km, new.next_due_hours,
              coalesce((select r.created_by from public.work_order_reports r where r.work_order_id = new.id and r.kind = 'post'), auth.uid()));
    end if;
  end if;
  return null;
end $$;
create trigger work_orders_apply_next_due after update on public.work_orders for each row execute function app.work_orders_apply_next_due();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Can the signed-in person work on this job? (managers any; others theirs or unassigned)
create or replace function app.require_job_access(w public.work_orders) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.has_capability(w.organisation_id, 'work_orders.manage') then
    return;
  end if;
  if not app.has_capability(w.organisation_id, 'work_orders.work') then
    perform app.raise('forbidden', 'You do not have permission to do this');
  end if;
  if w.assigned_to is not null and w.assigned_to <> auth.uid() then
    perform app.raise('forbidden', 'This job is assigned to someone else');
  end if;
end $$;

create or replace function public.submit_work_order_report(
  p_work_order_id uuid,
  p_kind text,
  p_notes text,
  p_checks jsonb default '{}'::jsonb,
  p_photos text[] default '{}'::text[],
  p_odometer_km numeric default null,
  p_engine_hours numeric default null,
  p_next_due_on date default null,
  p_next_due_km numeric default null,
  p_next_due_hours numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  w public.work_orders%rowtype;
  v_id uuid;
  v_today date;
begin
  select * into w from public.work_orders where id = p_work_order_id;
  if w.id is null then
    perform app.raise('not_found', 'Work order not found');
  end if;
  perform app.require_job_access(w);
  if p_kind not in ('pre', 'post') then
    perform app.raise('invalid_kind', 'Choose a pre-work or post-work report');
  end if;
  if p_kind = 'pre' and w.status not in ('open', 'in_progress') then
    perform app.raise('invalid_status', 'The pre-work report is done before or while working on the job');
  end if;
  if p_kind = 'post' and w.status not in ('in_progress', 'completed') then
    perform app.raise('invalid_status', 'Start the job before the post-work report');
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 3 then
    perform app.raise('notes_required', case when p_kind = 'pre' then 'Describe the condition before work' else 'Describe the work done' end);
  end if;
  perform app.check_evidence(w.organisation_id, w.asset_id, p_photos);
  select (now() at time zone coalesce(timezone, 'Australia/Brisbane'))::date into v_today from public.organisations where id = w.organisation_id;
  if p_kind = 'post' and p_next_due_on is not null and p_next_due_on <= v_today then
    perform app.raise('invalid_next_due', 'The next service date must be in the future');
  end if;

  insert into public.work_order_reports (organisation_id, work_order_id, kind, checks, notes, photo_paths, odometer_km, engine_hours, created_by)
  values (w.organisation_id, w.id, p_kind, coalesce(p_checks, '{}'::jsonb), btrim(p_notes), coalesce(p_photos, '{}'), p_odometer_km, p_engine_hours, auth.uid())
  on conflict (work_order_id, kind) do update
    set checks = excluded.checks, notes = excluded.notes, photo_paths = excluded.photo_paths,
        odometer_km = excluded.odometer_km, engine_hours = excluded.engine_hours
  returning id into v_id;

  if p_kind = 'post' and w.service_plan_id is not null then
    update public.work_orders set next_due_on = p_next_due_on, next_due_km = p_next_due_km, next_due_hours = p_next_due_hours where id = w.id;
  end if;
  return v_id;
end $$;
revoke execute on function public.submit_work_order_report(uuid, text, text, jsonb, text[], numeric, numeric, date, numeric, numeric) from public, anon;
grant execute on function public.submit_work_order_report(uuid, text, text, jsonb, text[], numeric, numeric, date, numeric, numeric) to authenticated, service_role;

create or replace function public.add_work_order_file(
  p_work_order_id uuid,
  p_kind text,
  p_path text,
  p_file_name text,
  p_supplier text default null,
  p_reference text default null,
  p_amount_cents bigint default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  w public.work_orders%rowtype;
  v_id uuid;
begin
  select * into w from public.work_orders where id = p_work_order_id;
  if w.id is null then
    perform app.raise('not_found', 'Work order not found');
  end if;
  perform app.require_job_access(w);
  if w.status = 'cancelled' then
    perform app.raise('invalid_status', 'This work order was cancelled');
  end if;
  if left(coalesce(p_path, ''), char_length(w.organisation_id::text || '/' || w.id::text || '/')) <> w.organisation_id::text || '/' || w.id::text || '/'
     or p_path like '%..%' then
    perform app.raise('invalid_file', 'The file was not uploaded for this work order');
  end if;
  if p_kind not in ('invoice', 'receipt', 'quote', 'photo', 'other') then
    perform app.raise('invalid_kind', 'Choose what kind of document it is');
  end if;
  insert into public.work_order_files (organisation_id, work_order_id, kind, path, file_name, supplier, reference, amount_cents, uploaded_by)
  values (w.organisation_id, w.id, p_kind, p_path, btrim(p_file_name), nullif(btrim(coalesce(p_supplier, '')), ''),
          nullif(btrim(coalesce(p_reference, '')), ''), p_amount_cents, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.add_work_order_file(uuid, text, text, text, text, text, bigint) from public, anon;
grant execute on function public.add_work_order_file(uuid, text, text, text, text, text, bigint) to authenticated, service_role;

-- Removing marks it removed (the record and file stay for the audit trail).
create or replace function public.remove_work_order_file(p_file_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.work_order_files%rowtype;
  w public.work_orders%rowtype;
begin
  select * into f from public.work_order_files where id = p_file_id and removed_at is null;
  if f.id is null then
    perform app.raise('not_found', 'Document not found');
  end if;
  select * into w from public.work_orders where id = f.work_order_id;
  if not app.has_capability(f.organisation_id, 'work_orders.manage') then
    if f.uploaded_by <> auth.uid() or w.status = 'closed' then
      perform app.raise('forbidden', 'Only the person who added it can remove it, before the job is closed');
    end if;
  end if;
  update public.work_order_files set removed_at = now(), removed_by = auth.uid() where id = f.id;
end $$;
revoke execute on function public.remove_work_order_file(uuid) from public, anon;
grant execute on function public.remove_work_order_file(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket; path <organisation>/<work order>/<file>.
-- Skipped where the storage schema doesn't exist (local test database).
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('work-order-files', 'work-order-files', false, 15728640,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do nothing;
    execute $p$
      create policy work_order_files_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'work-order-files'
        and ((storage.foldername(name))[1] = any ((select app.orgs_with_capability('work_orders.work'))::text[])
             or (storage.foldername(name))[1] = any ((select app.orgs_with_capability('work_orders.manage'))::text[]))
      )$p$;
    execute $p$
      create policy work_order_files_view on storage.objects for select to authenticated using (
        bucket_id = 'work-order-files'
        and ((storage.foldername(name))[1] = any ((select app.orgs_with_capability('work_orders.work'))::text[])
             or (storage.foldername(name))[1] = any ((select app.orgs_with_capability('work_orders.manage'))::text[]))
      )$p$;
  end if;
end $do$;
