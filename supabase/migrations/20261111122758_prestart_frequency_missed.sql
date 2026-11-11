-- Pre-start frequency and missed pre-starts (2B: missed inspections and review).
-- * Each equipment type has a pre-start frequency: daily, weekly or not
--   required. Vehicles and mobile plant are daily; portable or fixed equipment
--   weekly. A piece of equipment can override its type.
-- * An hourly job checks each company in its own timezone. When a day (or a
--   Monday–Sunday week) has ended, current equipment that was due a check and
--   has no pre-start gets a missed pre-start record. Out-of-service, archived
--   and later-added equipment is left out; weekends are skipped for daily
--   checks (setting). The Owner, Fleet Managers and Company Admins get one alert.
-- * Managers with inspections.review mark each one "not used" or "missed",
--   with a note. Every review is audited.

create type public.prestart_frequency as enum ('daily', 'weekly', 'not_required');

alter table public.asset_classes add column prestart_frequency public.prestart_frequency not null default 'daily';
update public.asset_classes set prestart_frequency = 'weekly' where code = 'portable_fixed_equipment';

alter table public.assets add column prestart_frequency public.prestart_frequency;
comment on column public.assets.prestart_frequency is 'Overrides the equipment type''s pre-start frequency; null = as per type.';
grant insert (prestart_frequency) on public.assets to authenticated;
grant update (prestart_frequency) on public.assets to authenticated;

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('prestart.skip_weekends', 'true', 'Daily pre-starts are not expected on Saturdays and Sundays', 'recommended', '2B missed inspections')
on conflict (key) do nothing;

create table public.missed_prestarts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null,
  frequency public.prestart_frequency not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'not_used', 'missed')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (asset_id, period_start),
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create index missed_prestarts_org_idx on public.missed_prestarts (organisation_id, status, period_start desc);
create index missed_prestarts_asset_org_idx on public.missed_prestarts (asset_id, organisation_id);
create index missed_prestarts_reviewed_by_idx on public.missed_prestarts (reviewed_by);
create trigger audit_missed_prestarts after insert or update or delete on public.missed_prestarts
  for each row execute function app.audit_row_change('organisation_id');

alter table public.missed_prestarts enable row level security;
revoke all on public.missed_prestarts from anon, authenticated;
grant select on public.missed_prestarts to authenticated;
create policy missed_prestarts_read on public.missed_prestarts for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('inspections.review'))::uuid[])
  or (select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed'));

-- Record missed pre-starts for every company whose day (or week) has ended.
-- Safe to run any number of times: each equipment/period is recorded once.
create or replace function app.detect_missed_prestarts(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_week_start date;
  v_skip_weekends boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'prestart.skip_weekends'), true);
  v_new integer;
  v_total integer := 0;
begin
  for o in select id, coalesce(timezone, 'Australia/Brisbane') as tz from public.organisations
           where kind = 'company' and status not in ('closing', 'closed') loop
    v_new := 0;
    v_day := (p_now at time zone o.tz)::date - 1;   -- the company's yesterday
    v_start := v_day::timestamp at time zone o.tz;
    v_end := (v_day + 1)::timestamp at time zone o.tz;

    -- Daily checks (not on weekends when the setting says so).
    if not (v_skip_weekends and extract(isodow from v_day) in (6, 7)) then
      with ins as (
        insert into public.missed_prestarts (organisation_id, asset_id, frequency, period_start, period_end)
        select o.id, a.id, 'daily', v_day, v_day
        from public.assets a
        join public.asset_classes c on c.id = a.asset_class_id
        where a.organisation_id = o.id and a.archived_at is null and a.condition <> 'out_of_service'
          and a.created_at < v_start
          and coalesce(a.prestart_frequency, c.prestart_frequency) = 'daily'
          and not exists (select 1 from public.inspections i
                          where i.asset_id = a.id and i.submitted_at >= v_start and i.submitted_at < v_end)
        on conflict (asset_id, period_start) do nothing
        returning 1)
      select count(*) into v_new from ins;
    end if;

    -- Weekly checks: when the company's yesterday was a Sunday.
    if extract(isodow from v_day) = 7 then
      v_week_start := v_day - 6;
      with ins as (
        insert into public.missed_prestarts (organisation_id, asset_id, frequency, period_start, period_end)
        select o.id, a.id, 'weekly', v_week_start, v_day
        from public.assets a
        join public.asset_classes c on c.id = a.asset_class_id
        where a.organisation_id = o.id and a.archived_at is null and a.condition <> 'out_of_service'
          and a.created_at < (v_week_start::timestamp at time zone o.tz)
          and coalesce(a.prestart_frequency, c.prestart_frequency) = 'weekly'
          and not exists (select 1 from public.inspections i
                          where i.asset_id = a.id and i.submitted_at >= (v_week_start::timestamp at time zone o.tz) and i.submitted_at < v_end)
        on conflict (asset_id, period_start) do nothing
        returning 1)
      select v_new + count(*) into v_new from ins;
    end if;

    if v_new > 0 then
      perform app.notify(o.id, 'prestart_missed',
        format('%s pre-start%s missed (%s)', v_new, case when v_new = 1 then '' else 's' end, to_char(v_day, 'DD/MM/YYYY')),
        'Review them under Inspections → Missed: mark each as not used or missed.', null, true);
    end if;
    v_total := v_total + v_new;
  end loop;
  return v_total;
end $$;

-- A manager reviews a missed pre-start: the equipment wasn't used, or the check was missed.
create or replace function public.review_missed_prestart(p_id uuid, p_outcome text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.missed_prestarts%rowtype;
begin
  select * into m from public.missed_prestarts where id = p_id for update;
  if m.id is null then
    perform app.raise('not_found', 'Missed pre-start not found');
  end if;
  perform app.require_capability(m.organisation_id, 'inspections.review');
  if p_outcome not in ('not_used', 'missed') then
    perform app.raise('invalid_outcome', 'Choose "not used" or "missed"');
  end if;
  if p_outcome = 'missed' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    perform app.raise('note_required', 'Say what happened and what was done about it');
  end if;
  update public.missed_prestarts
  set status = p_outcome, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = m.id;
end $$;

revoke execute on function app.detect_missed_prestarts(timestamptz) from public, anon, authenticated;
revoke execute on function public.review_missed_prestart(uuid, text, text) from public, anon;
grant execute on function public.review_missed_prestart(uuid, text, text) to authenticated, service_role;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('hvems-missed-prestarts', '5 * * * *', 'select app.detect_missed_prestarts()');
  end if;
end $do$;
