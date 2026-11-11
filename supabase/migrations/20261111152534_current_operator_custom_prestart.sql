-- Current operator and custom pre-start frequency.
-- * Each piece of equipment is linked to the operator who did its latest
--   pre-start. When another operator does a pre-start, the link moves to them.
--   Set by the database when a pre-start is submitted, never by hand.
-- * Equipment can have a custom pre-start frequency: every N days (2–365).
--   A missed pre-start is recorded when N days pass with no pre-start.
-- (Operator wording for credential alerts: 20261111200000_operator_wording.)

-- ---------------------------------------------------------------------------
-- Current operator
-- ---------------------------------------------------------------------------
alter table public.assets
  add column current_operator_id uuid references auth.users (id) on delete set null,
  add column current_operator_since timestamptz;
comment on column public.assets.current_operator_id is 'The person who did the latest pre-start; set by the database only.';
create index assets_current_operator_idx on public.assets (current_operator_id);

create or replace function app.link_current_operator() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.assets
  set current_operator_id = new.submitted_by, current_operator_since = new.submitted_at
  where id = new.asset_id and organisation_id = new.organisation_id
    and (current_operator_since is null or current_operator_since <= new.submitted_at)
    and current_operator_id is distinct from new.submitted_by;
  -- Same person again: only the time moves.
  update public.assets
  set current_operator_since = new.submitted_at
  where id = new.asset_id and organisation_id = new.organisation_id
    and current_operator_id = new.submitted_by and current_operator_since < new.submitted_at;
  return new;
end $$;
revoke execute on function app.link_current_operator() from public, anon, authenticated;

create trigger inspections_link_operator after insert on public.inspections
  for each row execute function app.link_current_operator();

-- Existing equipment: the operator of its latest pre-start.
update public.assets a
set current_operator_id = l.submitted_by, current_operator_since = l.submitted_at
from (select distinct on (asset_id) asset_id, submitted_by, submitted_at
      from public.inspections order by asset_id, submitted_at desc) l
where l.asset_id = a.id;

-- ---------------------------------------------------------------------------
-- Custom pre-start frequency: every N days
-- ---------------------------------------------------------------------------
alter type public.prestart_frequency add value if not exists 'custom';

alter table public.assets add column prestart_every_days smallint
  check (prestart_every_days is null or prestart_every_days between 2 and 365);
comment on column public.assets.prestart_every_days is 'Days between pre-starts when prestart_frequency is custom.';
grant insert (prestart_every_days) on public.assets to authenticated;
grant update (prestart_every_days) on public.assets to authenticated;

create or replace function app.assets_prestart_days() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.prestart_frequency::text = 'custom' then
    if new.prestart_every_days is null then
      perform app.raise('asset_invalid', 'Enter how many days between pre-starts (2 to 365)');
    end if;
  else
    new.prestart_every_days := null;
  end if;
  return new;
end $$;
create trigger assets_prestart_days before insert or update of prestart_frequency, prestart_every_days on public.assets
  for each row execute function app.assets_prestart_days();

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
          and coalesce(a.prestart_frequency, c.prestart_frequency)::text = 'daily'
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
          and coalesce(a.prestart_frequency, c.prestart_frequency)::text = 'weekly'
          and not exists (select 1 from public.inspections i
                          where i.asset_id = a.id and i.submitted_at >= (v_week_start::timestamp at time zone o.tz) and i.submitted_at < v_end)
        on conflict (asset_id, period_start) do nothing
        returning 1)
      select v_new + count(*) into v_new from ins;
    end if;

    -- Custom checks: N days in a row without a pre-start, recorded once per N days.
    with ins as (
      insert into public.missed_prestarts (organisation_id, asset_id, frequency, period_start, period_end)
      select o.id, a.id, 'custom', v_day - a.prestart_every_days + 1, v_day
      from public.assets a
      where a.organisation_id = o.id and a.archived_at is null and a.condition <> 'out_of_service'
        and a.prestart_frequency::text = 'custom' and a.prestart_every_days is not null
        and a.created_at < ((v_day - a.prestart_every_days + 1)::timestamp at time zone o.tz)
        and not exists (select 1 from public.inspections i
                        where i.asset_id = a.id
                          and i.submitted_at >= ((v_day - a.prestart_every_days + 1)::timestamp at time zone o.tz)
                          and i.submitted_at < v_end)
        and not exists (select 1 from public.missed_prestarts m
                        where m.asset_id = a.id and m.period_end > v_day - a.prestart_every_days)
      on conflict (asset_id, period_start) do nothing
      returning 1)
    select v_new + count(*) into v_new from ins;

    if v_new > 0 then
      perform app.notify(o.id, 'prestart_missed',
        format('%s pre-start%s missed (%s)', v_new, case when v_new = 1 then '' else 's' end, to_char(v_day, 'DD/MM/YYYY')),
        'Review them under Inspections → Missed: mark each as not used or missed.', null, true);
    end if;
    v_total := v_total + v_new;
  end loop;
  return v_total;
end $$;
revoke execute on function app.detect_missed_prestarts(timestamptz) from public, anon, authenticated;

