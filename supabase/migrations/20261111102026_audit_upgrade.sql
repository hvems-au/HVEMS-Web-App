-- Audit upgrade (reconciliation §3 item 8, AUD-01–03).
-- * Context on every audit and security event: portal, IP address and browser,
--   taken from headers the HVEMS server sends with each request.
-- * Daily hash chain (AUD-03): after each Brisbane day, a digest of that day's
--   audit and security events, chained to the previous day's digest. Changing
--   or removing a past event breaks the chain; verify_audit_chain reports it.
--   Digests are append-only like the events themselves.

-- ---------------------------------------------------------------------------
-- Request context
-- ---------------------------------------------------------------------------
alter table public.security_events add column context jsonb not null default '{}'::jsonb;

create or replace function app.request_context() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  h jsonb;
begin
  h := nullif(current_setting('request.headers', true), '')::jsonb;
  if h is null then
    return '{}'::jsonb;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'portal', nullif(h ->> 'x-hvems-portal', ''),
    'ip', coalesce(nullif(h ->> 'x-hvems-client-ip', ''), nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')),
    'user_agent', left(coalesce(nullif(h ->> 'x-hvems-user-agent', ''), h ->> 'user-agent'), 200)));
exception when others then
  return '{}'::jsonb;
end $$;

create or replace function app.event_fill_context() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.context := app.request_context() || coalesce(new.context, '{}'::jsonb);
  return new;
end $$;

create trigger audit_events_context before insert on public.audit_events
  for each row execute function app.event_fill_context();
create trigger security_events_context before insert on public.security_events
  for each row execute function app.event_fill_context();
grant execute on function app.request_context() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily hash chain
-- ---------------------------------------------------------------------------
create table public.audit_daily_digests (
  day date primary key,
  audit_count integer not null,
  security_count integer not null,
  prev_digest text,
  digest text not null,
  sealed_at timestamptz not null default now()
);
comment on table public.audit_daily_digests is 'AUD-03: one SHA-256 digest per Brisbane day over that day''s audit and security events, chained to the previous day.';
create trigger audit_daily_digests_no_update before update or delete on public.audit_daily_digests
  for each row execute function app.prevent_audit_mutation();
create trigger audit_daily_digests_no_truncate before truncate on public.audit_daily_digests
  for each statement execute function app.prevent_audit_mutation();
alter table public.audit_daily_digests enable row level security;
revoke all on public.audit_daily_digests from anon, authenticated;
grant select on public.audit_daily_digests to authenticated;
create policy audit_daily_digests_read on public.audit_daily_digests for select to authenticated
  using ((select app.is_platform_staff()));

-- Fixed columns and UTC times, so the digest never depends on session settings
-- or on columns added later.
create or replace function app.audit_day_digest(p_day date, p_prev text)
returns table (audit_count integer, security_count integer, digest text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz := (p_day::timestamp at time zone 'Australia/Brisbane');
  v_end timestamptz := ((p_day + 1)::timestamp at time zone 'Australia/Brisbane');
  a_n integer; a_h text; s_n integer; s_h text;
begin
  select count(*), string_agg(encode(extensions.digest(convert_to(jsonb_build_array(
           a.id, to_char(a.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), a.organisation_id, a.actor_user_id,
           a.actor_method, a.action, a.entity_type, a.entity_id, a.changes, a.context)::text, 'UTF8'), 'sha256'), 'hex'), '' order by a.id)
    into a_n, a_h
  from public.audit_events a where a.occurred_at >= v_start and a.occurred_at < v_end;
  select count(*), string_agg(encode(extensions.digest(convert_to(jsonb_build_array(
           s.id, to_char(s.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), s.user_id, s.organisation_id,
           s.event_type, s.detail, s.context)::text, 'UTF8'), 'sha256'), 'hex'), '' order by s.id)
    into s_n, s_h
  from public.security_events s where s.occurred_at >= v_start and s.occurred_at < v_end;
  return query select a_n, s_n,
    encode(extensions.digest(convert_to(coalesce(p_prev, 'HVEMS') || '|' || p_day::text || '|' || coalesce(a_h, '') || '|' || coalesce(s_h, ''), 'UTF8'), 'sha256'), 'hex');
end $$;

-- Seal every finished Brisbane day not sealed yet (run daily just after midnight).
create or replace function app.seal_audit_days() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_last public.audit_daily_digests%rowtype;
  v_day date;
  v_n integer := 0;
  d record;
begin
  perform pg_advisory_xact_lock(hashtextextended('hvems:seal_audit_days', 0));
  select * into v_last from public.audit_daily_digests order by day desc limit 1;
  v_day := coalesce(v_last.day + 1,
    (least((select min(occurred_at) from public.audit_events), (select min(occurred_at) from public.security_events), now())
      at time zone 'Australia/Brisbane')::date);
  v_day := coalesce(v_day, v_today);
  while v_day < v_today loop
    select * into d from app.audit_day_digest(v_day, v_last.digest);
    insert into public.audit_daily_digests (day, audit_count, security_count, prev_digest, digest)
    values (v_day, d.audit_count, d.security_count, v_last.digest, d.digest)
    returning * into v_last;
    v_day := v_day + 1;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Recompute the chain and report broken days (HVEMS staff with MFA).
create or replace function public.verify_audit_chain(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.audit_daily_digests%rowtype;
  v_prev text;
  v_first boolean := true;
  v_checked integer := 0;
  v_broken jsonb := '[]'::jsonb;
  d record;
begin
  if not app.is_platform_staff() then
    perform app.raise('forbidden', 'Only HVEMS staff signed in with MFA can verify the audit chain');
  end if;
  for r in select * from public.audit_daily_digests
           where (p_from is null or day >= p_from) and (p_to is null or day <= p_to) order by day loop
    if v_first then
      v_prev := r.prev_digest;
      v_first := false;
    end if;
    select * into d from app.audit_day_digest(r.day, v_prev);
    if d.digest <> r.digest or r.prev_digest is distinct from v_prev then
      v_broken := v_broken || jsonb_build_object('day', r.day, 'expected_events', r.audit_count + r.security_count,
        'found_events', d.audit_count + d.security_count);
    end if;
    v_prev := r.digest;
    v_checked := v_checked + 1;
  end loop;
  return jsonb_build_object('checked_days', v_checked, 'broken', v_broken,
    'last_sealed', (select max(day) from public.audit_daily_digests));
end $$;

revoke execute on function app.audit_day_digest(date, text), app.seal_audit_days() from public, anon, authenticated;
revoke execute on function public.verify_audit_chain(date, date) from public, anon;
grant execute on function public.verify_audit_chain(date, date) to authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    -- 14:10 UTC = 00:10 Brisbane.
    perform cron.schedule('hvems-seal-audit-days', '10 14 * * *', 'select app.seal_audit_days()');
  end if;
end $do$;
