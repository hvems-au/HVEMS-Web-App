-- A critical alert is about something needing attention now. Once its cause
-- is dealt with (hold removed, breakdown fixed, notice cleared, or every
-- Critical defect from the pre-start closed) the alert is acknowledged
-- automatically by the person who dealt with it, so it never escalates
-- after the fact. The equipment's condition is unaffected (ADR-005).

create or replace function app.acknowledge_alert_for(p_source_type text, p_source_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.critical_alerts
  set acknowledged_at = now(), acknowledged_by = auth.uid()
  where source_type = p_source_type and source_id = p_source_id and acknowledged_at is null
$$;

create or replace function app.alerts_ack_on_close() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'holds' and new.removed_at is not null and old.removed_at is null then
    perform app.acknowledge_alert_for('hold', new.id);
  elsif tg_table_name = 'breakdowns' and new.status = 'resolved' and old.status <> 'resolved' then
    perform app.acknowledge_alert_for('breakdown', new.id);
  elsif tg_table_name = 'regulator_notices' and new.status = 'cleared' and old.status <> 'cleared' then
    perform app.acknowledge_alert_for('regulator_notice', new.id);
  elsif tg_table_name = 'defects' and new.status <> 'open' and old.status = 'open' and new.inspection_id is not null
        and not exists (select 1 from public.defects d
                        where d.inspection_id = new.inspection_id and d.status = 'open' and d.severity = 'critical' and d.id <> new.id) then
    perform app.acknowledge_alert_for('inspection', new.inspection_id);
  end if;
  return new;
end $$;

create trigger holds_ack_alert after update on public.holds for each row execute function app.alerts_ack_on_close();
create trigger breakdowns_ack_alert after update on public.breakdowns for each row execute function app.alerts_ack_on_close();
create trigger regulator_notices_ack_alert after update on public.regulator_notices for each row execute function app.alerts_ack_on_close();
create trigger defects_ack_alert after update of status on public.defects for each row execute function app.alerts_ack_on_close();

revoke execute on function app.acknowledge_alert_for(text, uuid) from public, anon, authenticated;

-- Alerts whose cause was already dealt with before this change.
update public.critical_alerts a set acknowledged_at = now()
where a.acknowledged_at is null and (
  (a.source_type = 'hold' and exists (select 1 from public.holds h where h.id = a.source_id and h.removed_at is not null))
  or (a.source_type = 'breakdown' and exists (select 1 from public.breakdowns b where b.id = a.source_id and b.status = 'resolved'))
  or (a.source_type = 'regulator_notice' and exists (select 1 from public.regulator_notices n where n.id = a.source_id and n.status = 'cleared'))
);
