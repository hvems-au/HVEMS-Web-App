-- Workforce (2C, CS-19): technician profiles, qualifications with expiry,
-- leave, and allocation warnings on work orders.
-- * People: the company's active members who can be given work orders
--   (Owner, Company Admin, Fleet Manager, Technician). Each can have a profile
--   (trade, phone, notes, "available for work orders").
-- * Qualifications: trade certificate, licence, high-risk work licence,
--   induction, first aid, manufacturer training, other. Expiry alerts go to the
--   Owner, Fleet Managers and Company Admins (same warning period as operator
--   credentials), once before and once on expiry; a new date resets them.
-- * Leave: annual, sick, training, other, by date range. Cancelled, never
--   deleted.
-- * Allocation warnings never block: a work order can say which qualification it
--   needs, and the database records warnings whenever the person, due date or
--   requirement changes (on leave that day, marked unavailable, no current
--   qualification of that kind). Managers can preview them before saving.
-- Writes: workforce.manage (Owner, Company Admin, Fleet Manager). People see
-- their own profile, qualifications and leave. Everything is audited.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.workforce_profiles (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null,
  trade text check (trade is null or char_length(btrim(trade)) between 2 and 80),
  phone text check (phone is null or char_length(btrim(phone)) between 6 and 30),
  notes text check (notes is null or char_length(notes) <= 1000),
  available boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organisation_id, user_id),
  foreign key (organisation_id, user_id) references public.org_memberships (organisation_id, user_id) on delete cascade
);
create index workforce_profiles_user_idx on public.workforce_profiles (user_id);
create index workforce_profiles_updated_by_idx on public.workforce_profiles (updated_by);

create or replace function app.workforce_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.trade := nullif(btrim(coalesce(new.trade, '')), '');
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end $$;
create trigger workforce_profiles_touch before insert or update on public.workforce_profiles
  for each row execute function app.workforce_touch();
create trigger audit_workforce_profiles after insert or update or delete on public.workforce_profiles
  for each row execute function app.audit_row_change('organisation_id');

alter table public.workforce_profiles enable row level security;
revoke all on public.workforce_profiles from anon, authenticated;
grant select on public.workforce_profiles to authenticated;
grant insert (organisation_id, user_id, trade, phone, notes, available) on public.workforce_profiles to authenticated;
grant update (trade, phone, notes, available) on public.workforce_profiles to authenticated;
create policy workforce_profiles_read on public.workforce_profiles for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or user_id = (select auth.uid()));
create policy workforce_profiles_insert on public.workforce_profiles for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]));
create policy workforce_profiles_update on public.workforce_profiles for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]));

-- ---------------------------------------------------------------------------
-- Qualifications
-- ---------------------------------------------------------------------------
create table public.workforce_qualifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('trade_certificate', 'licence', 'high_risk_work', 'induction', 'first_aid', 'manufacturer_training', 'other')),
  label text check (label is null or char_length(btrim(label)) between 1 and 80),
  number text check (number is null or char_length(btrim(number)) between 1 and 60),
  issued_by text check (issued_by is null or char_length(issued_by) <= 80),
  expires_on date,
  warned_at timestamptz,
  expired_notified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, user_id) references public.org_memberships (organisation_id, user_id) on delete cascade,
  constraint workforce_qualifications_other_named check (kind <> 'other' or label is not null)
);
comment on table public.workforce_qualifications is 'Trade certificates, licences, tickets, inductions and training for the people who do work orders.';
create unique index workforce_qualifications_one_per_kind on public.workforce_qualifications (organisation_id, user_id, kind, coalesce(lower(label), ''));
create index workforce_qualifications_user_idx on public.workforce_qualifications (user_id);
create index workforce_qualifications_created_by_idx on public.workforce_qualifications (created_by);
create index workforce_qualifications_expiry_idx on public.workforce_qualifications (expires_on) where expires_on is not null;

create or replace function app.workforce_qualifications_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.expires_on is distinct from old.expires_on then
    new.warned_at := null;
    new.expired_notified_at := null;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.number := nullif(btrim(coalesce(new.number, '')), '');
  new.label := nullif(btrim(coalesce(new.label, '')), '');
  new.issued_by := nullif(btrim(coalesce(new.issued_by, '')), '');
  return new;
end $$;
create trigger workforce_qualifications_touch before insert or update on public.workforce_qualifications
  for each row execute function app.workforce_qualifications_touch();
create trigger audit_workforce_qualifications after insert or update or delete on public.workforce_qualifications
  for each row execute function app.audit_row_change('organisation_id');

alter table public.workforce_qualifications enable row level security;
revoke all on public.workforce_qualifications from anon, authenticated;
grant select on public.workforce_qualifications to authenticated;
grant insert (organisation_id, user_id, kind, label, number, issued_by, expires_on) on public.workforce_qualifications to authenticated;
grant update (kind, label, number, issued_by, expires_on) on public.workforce_qualifications to authenticated;
grant delete on public.workforce_qualifications to authenticated;
create policy workforce_qualifications_read on public.workforce_qualifications for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or user_id = (select auth.uid()));
create policy workforce_qualifications_insert on public.workforce_qualifications for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]));
create policy workforce_qualifications_update on public.workforce_qualifications for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]));
create policy workforce_qualifications_delete on public.workforce_qualifications for delete to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]));

create or replace function app.qualification_label(p_kind text, p_label text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'trade_certificate' then 'Trade certificate'
    when 'licence' then 'Licence'
    when 'high_risk_work' then 'High-risk work licence'
    when 'induction' then 'Induction'
    when 'first_aid' then 'First aid'
    when 'manufacturer_training' then 'Manufacturer training'
    else coalesce(p_label, 'Qualification')
  end || case when p_kind <> 'other' and p_label is not null then ' (' || p_label || ')' else '' end
$$;

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
create table public.workforce_leave (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('annual', 'sick', 'training', 'other')),
  starts_on date not null,
  ends_on date not null,
  note text check (note is null or char_length(note) <= 500),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organisation_id, user_id) references public.org_memberships (organisation_id, user_id) on delete cascade,
  constraint workforce_leave_dates check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index workforce_leave_lookup_idx on public.workforce_leave (organisation_id, user_id, starts_on) where cancelled_at is null;
create index workforce_leave_user_idx on public.workforce_leave (user_id);
create index workforce_leave_created_by_idx on public.workforce_leave (created_by);
create index workforce_leave_cancelled_by_idx on public.workforce_leave (cancelled_by);
create trigger audit_workforce_leave after insert or update or delete on public.workforce_leave
  for each row execute function app.audit_row_change('organisation_id');

alter table public.workforce_leave enable row level security;
revoke all on public.workforce_leave from anon, authenticated;
grant select on public.workforce_leave to authenticated;
grant insert (organisation_id, user_id, kind, starts_on, ends_on, note) on public.workforce_leave to authenticated;
create policy workforce_leave_read on public.workforce_leave for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[])
  or organisation_id = any ((select app.orgs_with_capability('work_orders.manage'))::uuid[])
  or user_id = (select auth.uid()));
create policy workforce_leave_insert on public.workforce_leave for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('workforce.manage'))::uuid[]));

-- Cancel leave (kept in the history).
create or replace function public.cancel_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.workforce_leave%rowtype;
begin
  select * into l from public.workforce_leave where id = p_id for update;
  if l.id is null then
    perform app.raise('not_found', 'Leave not found');
  end if;
  perform app.require_capability(l.organisation_id, 'workforce.manage');
  if l.cancelled_at is not null then
    return;
  end if;
  update public.workforce_leave set cancelled_at = now(), cancelled_by = auth.uid() where id = l.id;
end $$;
revoke execute on function public.cancel_leave(uuid) from public, anon;
grant execute on function public.cancel_leave(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Allocation warnings
-- ---------------------------------------------------------------------------
alter table public.work_orders
  add column required_qualification text check (required_qualification is null or required_qualification in
    ('trade_certificate', 'licence', 'high_risk_work', 'induction', 'first_aid', 'manufacturer_training')),
  add column assignment_warnings jsonb not null default '[]'::jsonb;
comment on column public.work_orders.assignment_warnings is 'Warnings recorded by the database when the person, due date or requirement changed. They never block.';

-- Warnings for giving work to a person on a day, needing a kind of qualification.
-- Returns [{code, message}]; empty when there's nothing to say.
create or replace function app.allocation_warnings(p_org uuid, p_user uuid, p_on date, p_required text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb := '[]'::jsonb;
  l record;
  q record;
  v_label text;
begin
  if p_user is null then
    return v;
  end if;
  if exists (select 1 from public.workforce_profiles p where p.organisation_id = p_org and p.user_id = p_user and not p.available) then
    v := v || jsonb_build_object('code', 'unavailable', 'message', 'Marked as not available for work orders');
  end if;
  select kind, starts_on, ends_on into l from public.workforce_leave
  where organisation_id = p_org and user_id = p_user and cancelled_at is null and p_on between starts_on and ends_on
  order by starts_on limit 1;
  if found then
    v := v || jsonb_build_object('code', 'on_leave', 'message',
      format('On %s leave %s', case l.kind when 'annual' then 'annual' when 'sick' then 'sick' when 'training' then 'training' else 'other' end,
        case when l.starts_on = l.ends_on then 'on ' || to_char(l.starts_on, 'DD/MM/YYYY')
             else to_char(l.starts_on, 'DD/MM/YYYY') || ' to ' || to_char(l.ends_on, 'DD/MM/YYYY') end));
  end if;
  if p_required is not null then
    v_label := app.qualification_label(p_required, null);
    if not exists (select 1 from public.workforce_qualifications
                   where organisation_id = p_org and user_id = p_user and kind = p_required
                     and (expires_on is null or expires_on >= p_on)) then
      select expires_on into q from public.workforce_qualifications
      where organisation_id = p_org and user_id = p_user and kind = p_required order by expires_on desc nulls first limit 1;
      v := v || jsonb_build_object('code', 'no_qualification', 'message',
        case when found then format('%s expired on %s', v_label, to_char(q.expires_on, 'DD/MM/YYYY'))
             else format('No %s recorded', lower(v_label)) end);
    end if;
  end if;
  return v;
end $$;
revoke execute on function app.allocation_warnings(uuid, uuid, date, text) from public, anon, authenticated;

-- The day a work order is checked against: its due date, else today in the company's timezone.
create or replace function app.work_order_day(p_org uuid, p_due date) returns date
language sql stable security definer set search_path = '' as $$
  select coalesce(p_due, (now() at time zone coalesce((select timezone from public.organisations where id = p_org), 'Australia/Brisbane'))::date)
$$;
revoke execute on function app.work_order_day(uuid, date) from public, anon, authenticated;

create or replace function app.work_orders_allocation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'internal' and new.assigned_to is not null then
    new.assignment_warnings := app.allocation_warnings(new.organisation_id, new.assigned_to,
      app.work_order_day(new.organisation_id, new.due_on), new.required_qualification);
  else
    new.assignment_warnings := '[]'::jsonb;
  end if;
  return new;
end $$;
revoke execute on function app.work_orders_allocation() from public, anon, authenticated;
create trigger work_orders_allocation before insert or update of assigned_to, due_on, required_qualification, kind on public.work_orders
  for each row execute function app.work_orders_allocation();

-- Preview for the work order form (managers only).
create or replace function public.allocation_warnings(p_organisation_id uuid, p_user_id uuid, p_due_on date default null, p_required text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_capability(p_organisation_id, 'work_orders.manage');
  return app.allocation_warnings(p_organisation_id, p_user_id, app.work_order_day(p_organisation_id, p_due_on), nullif(p_required, ''));
end $$;
revoke execute on function public.allocation_warnings(uuid, uuid, date, text) from public, anon;
grant execute on function public.allocation_warnings(uuid, uuid, date, text) to authenticated, service_role;

-- Set the qualification a work order needs (managers; open work only).
create or replace function public.set_work_order_requirement(p_id uuid, p_required text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w public.work_orders%rowtype;
begin
  select * into w from public.work_orders where id = p_id for update;
  if w.id is null then
    perform app.raise('not_found', 'Work order not found');
  end if;
  perform app.require_capability(w.organisation_id, 'work_orders.manage');
  if w.status in ('closed', 'cancelled') then
    perform app.raise('work_order_finished', 'This work order is finished');
  end if;
  update public.work_orders set required_qualification = nullif(p_required, '') where id = w.id
  returning assignment_warnings into w.assignment_warnings;
  return w.assignment_warnings;
end $$;
revoke execute on function public.set_work_order_requirement(uuid, text) from public, anon;
grant execute on function public.set_work_order_requirement(uuid, text) to authenticated, service_role;

-- Existing work orders: record warnings now.
update public.work_orders set assigned_to = assigned_to where assigned_to is not null and status not in ('closed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Qualification expiry alerts (daily with operator credentials, 7 am Brisbane)
-- ---------------------------------------------------------------------------
create or replace function app.notify_qualification_expiry() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_warn integer := coalesce(app.setting_int('drivers.credential_warning_days'), 30);
  v_count integer := 0;
  r record;
begin
  for r in
    select q.id, q.organisation_id, q.kind, q.label, q.expires_on, coalesce(p.full_name, p.email, 'A team member') as who
    from public.workforce_qualifications q
    join public.org_memberships m on m.organisation_id = q.organisation_id and m.user_id = q.user_id and m.status = 'active'
    left join public.profiles p on p.id = q.user_id
    where q.expires_on is not null
      and ((q.expires_on < v_today and q.expired_notified_at is null)
        or (q.expires_on >= v_today and q.expires_on <= v_today + v_warn and q.warned_at is null))
  loop
    if r.expires_on < v_today then
      perform app.notify(r.organisation_id, 'credential_expired',
        format('%s''s %s has expired', r.who, app.qualification_label(r.kind, r.label)),
        format('It expired on %s. Update it on the Technicians page once renewed.', to_char(r.expires_on, 'DD/MM/YYYY')), null, true);
      update public.workforce_qualifications set expired_notified_at = now(), warned_at = coalesce(warned_at, now()) where id = r.id;
    else
      perform app.notify(r.organisation_id, 'credential_expiring',
        format('%s''s %s expires on %s', r.who, app.qualification_label(r.kind, r.label), to_char(r.expires_on, 'DD/MM/YYYY')),
        'Update it on the Technicians page once renewed.', null, true);
      update public.workforce_qualifications set warned_at = now() where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function app.notify_qualification_expiry(), app.qualification_label(text, text) from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('hvems-qualification-expiry', '5 21 * * *', 'select app.notify_qualification_expiry()');
  end if;
end $do$;
