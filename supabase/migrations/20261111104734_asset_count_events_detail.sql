-- Equipment count history detail (reconciliation §3 item 7, §4.3, AST-16, §10.2).
-- Every count event now records the count before and after, and who caused it;
-- 'merged' joins the reasons (AST-05). Filled by the database, so callers can't
-- supply their own numbers. Events recorded before this change keep their
-- original fields (the table is append-only); totals still come from the deltas.

alter table public.asset_count_events add column count_before integer, add column count_after integer,
  add column actor_user_id uuid references auth.users (id) on delete set null;
create index asset_count_events_actor_idx on public.asset_count_events (actor_user_id);

alter table public.asset_count_events drop constraint asset_count_events_reason_check;
alter table public.asset_count_events add constraint asset_count_events_reason_check
  check (reason in ('created', 'imported', 'archived', 'restored', 'converted', 'merged'));

create or replace function app.asset_count_events_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- One writer per organisation at a time, so before/after never overlap.
  perform pg_advisory_xact_lock(hashtextextended('asset_count:' || new.organisation_id::text, 0));
  select coalesce(sum(delta), 0)::integer into new.count_before
  from public.asset_count_events where organisation_id = new.organisation_id;
  new.count_after := new.count_before + new.delta;
  new.actor_user_id := auth.uid();
  return new;
end $$;
create trigger asset_count_events_fill before insert on public.asset_count_events
  for each row execute function app.asset_count_events_fill();
revoke execute on function app.asset_count_events_fill() from public, anon;
