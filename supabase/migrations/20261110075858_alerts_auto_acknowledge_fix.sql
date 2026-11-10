-- Fix: one trigger function per table (a shared function referenced fields
-- that only some tables have, which errors in PL/pgSQL: marking a defect
-- repaired or removing a hold failed between 07:56 and 07:59 UTC on 10 Nov).
create or replace function app.alerts_ack_on_close() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'holds' then
    if new.removed_at is not null and old.removed_at is null then
      perform app.acknowledge_alert_for('hold', new.id);
    end if;
  end if;
  return new;
end $$;

create or replace function app.alerts_ack_on_breakdown() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then
    perform app.acknowledge_alert_for('breakdown', new.id);
  end if;
  return new;
end $$;

create or replace function app.alerts_ack_on_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cleared' and old.status <> 'cleared' then
    perform app.acknowledge_alert_for('regulator_notice', new.id);
  end if;
  return new;
end $$;

create or replace function app.alerts_ack_on_defect() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'open' and old.status = 'open' and new.inspection_id is not null
     and not exists (select 1 from public.defects d
                     where d.inspection_id = new.inspection_id and d.status = 'open' and d.severity = 'critical' and d.id <> new.id) then
    perform app.acknowledge_alert_for('inspection', new.inspection_id);
  end if;
  return new;
end $$;

create or replace trigger breakdowns_ack_alert after update on public.breakdowns for each row execute function app.alerts_ack_on_breakdown();
create or replace trigger regulator_notices_ack_alert after update on public.regulator_notices for each row execute function app.alerts_ack_on_notice();
create or replace trigger defects_ack_alert after update of status on public.defects for each row execute function app.alerts_ack_on_defect();
