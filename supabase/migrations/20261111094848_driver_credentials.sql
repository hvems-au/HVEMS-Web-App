-- Driver credentials (2B): licence, plant ticket (HRWL), induction card, track
-- safety and other cards on the driver profile, with expiry warnings.
-- * Managers with drivers.manage add, update and remove them; the driver sees
--   their own. Every change is in the audit history.
-- * Daily at 7 am Brisbane, the Owner and Fleet Managers are notified once when
--   a credential is within the warning period (setting, 30 days) and once when
--   it has expired. Renewing (a new expiry date) resets both.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('drivers.credential_warning_days', '30', 'Days before a driver credential expires that the Owner and Fleet Managers are warned', 'recommended', '2B driver credentials')
on conflict (key) do nothing;

create table public.driver_credentials (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_id uuid not null,
  kind text not null check (kind in ('driver_licence', 'plant_ticket', 'induction_card', 'track_safety', 'other')),
  label text check (label is null or char_length(btrim(label)) between 1 and 80),
  number text not null check (char_length(btrim(number)) between 1 and 60),
  issued_by text check (issued_by is null or char_length(issued_by) <= 80),
  expires_on date,
  warned_at timestamptz,
  expired_notified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (driver_id, organisation_id) references public.driver_profiles (id, organisation_id) on delete cascade,
  constraint driver_credentials_other_named check (kind <> 'other' or label is not null)
);
comment on table public.driver_credentials is 'Driver licences, plant tickets, induction cards and track safety cards, with expiry dates.';
create unique index driver_credentials_one_per_kind on public.driver_credentials (driver_id, kind, coalesce(lower(label), ''));
create index driver_credentials_driver_org_idx on public.driver_credentials (driver_id, organisation_id);
create index driver_credentials_org_idx on public.driver_credentials (organisation_id);
create index driver_credentials_created_by_idx on public.driver_credentials (created_by);
create index driver_credentials_expiry_idx on public.driver_credentials (expires_on) where expires_on is not null;

-- A new expiry date (renewal) clears the "warned" and "expired" marks.
create or replace function app.driver_credentials_touch() returns trigger
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
  new.number := btrim(new.number);
  new.label := nullif(btrim(coalesce(new.label, '')), '');
  return new;
end $$;
create trigger driver_credentials_touch before insert or update on public.driver_credentials
  for each row execute function app.driver_credentials_touch();
create trigger audit_driver_credentials after insert or update or delete on public.driver_credentials
  for each row execute function app.audit_row_change('organisation_id');

alter table public.driver_credentials enable row level security;
revoke all on public.driver_credentials from anon, authenticated;
grant select on public.driver_credentials to authenticated;
grant insert (organisation_id, driver_id, kind, label, number, issued_by, expires_on) on public.driver_credentials to authenticated;
grant update (kind, label, number, issued_by, expires_on) on public.driver_credentials to authenticated;
grant delete on public.driver_credentials to authenticated;

create policy driver_credentials_read on public.driver_credentials for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[])
  or exists (select 1 from public.driver_profiles d where d.id = driver_id and d.user_id = (select auth.uid())));
create policy driver_credentials_insert on public.driver_credentials for insert to authenticated
  with check (organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]));
create policy driver_credentials_update on public.driver_credentials for update to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]))
  with check (organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]));
create policy driver_credentials_delete on public.driver_credentials for delete to authenticated
  using (organisation_id = any ((select app.orgs_with_capability('drivers.manage'))::uuid[]));

-- ---------------------------------------------------------------------------
-- Expiry notifications
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired'));

create or replace function app.credential_label(p_kind text, p_label text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'driver_licence' then 'driver licence'
    when 'plant_ticket' then 'plant ticket'
    when 'induction_card' then 'induction card'
    when 'track_safety' then 'track safety card'
    else coalesce(p_label, 'credential') end
    || case when p_kind <> 'other' and p_label is not null then ' (' || p_label || ')' else '' end
$$;

create or replace function app.notify_credential_expiry() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_warn integer := coalesce(app.setting_int('drivers.credential_warning_days'), 30);
  v_count integer := 0;
  r record;
begin
  for r in
    select c.id, c.organisation_id, c.kind, c.label, c.expires_on, c.warned_at, c.expired_notified_at, d.full_name
    from public.driver_credentials c
    join public.driver_profiles d on d.id = c.driver_id and d.active
    where c.expires_on is not null
      and ((c.expires_on < v_today and c.expired_notified_at is null)
        or (c.expires_on >= v_today and c.expires_on <= v_today + v_warn and c.warned_at is null))
  loop
    if r.expires_on < v_today then
      perform app.notify(r.organisation_id, 'credential_expired',
        format('%s''s %s has expired', r.full_name, app.credential_label(r.kind, r.label)),
        format('It expired on %s. Update it on the Drivers page once renewed.', to_char(r.expires_on, 'DD/MM/YYYY')), null);
      update public.driver_credentials set expired_notified_at = now(), warned_at = coalesce(warned_at, now()) where id = r.id;
    else
      perform app.notify(r.organisation_id, 'credential_expiring',
        format('%s''s %s expires on %s', r.full_name, app.credential_label(r.kind, r.label), to_char(r.expires_on, 'DD/MM/YYYY')),
        'Update it on the Drivers page once renewed.', null);
      update public.driver_credentials set warned_at = now() where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function app.notify_credential_expiry(), app.credential_label(text, text) from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    -- 21:00 UTC = 7:00 am Brisbane (no daylight saving).
    perform cron.schedule('hvems-credential-expiry', '0 21 * * *', 'select app.notify_credential_expiry()');
  end if;
end $do$;
