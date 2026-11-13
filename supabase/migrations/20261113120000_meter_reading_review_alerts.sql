-- Readings awaiting a manager (lower than the last accepted reading, or out of
-- sequence) now alert the Owner, Fleet Managers and Company Admins; they decide
-- on the new "Readings to approve" page (decide_meter_reading, unchanged).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed', 'meter_reading_review'));

create or replace function app.meter_reading_review_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_asset text;
  v_who text;
  v_unit text := case new.unit when 'km' then 'odometer' else 'hour meter' end;
begin
  if new.status <> 'pending_acceptance' then
    return null;
  end if;
  select asset_number into v_asset from public.assets where id = new.asset_id;
  select coalesce(full_name, email, 'Someone') into v_who from public.profiles where id = new.recorded_by;
  perform app.notify(new.organisation_id, 'meter_reading_review',
    format('%s: %s reading of %s needs approval', v_asset, v_unit, trim(to_char(new.value, 'FM999G999G990D0'))),
    format('Recorded by %s. %s Approve or reject it under Equipment → Readings to approve.',
           coalesce(v_who, 'someone'),
           case when new.out_of_sequence then 'It is dated before the last accepted reading.'
                else format('Reason given: %s.', coalesce(new.lower_reading_reason, '—')) end),
    new.asset_id, true);
  return null;
end $$;
create trigger meter_readings_review_alert after insert on public.meter_readings
  for each row execute function app.meter_reading_review_alert();

-- Direct readings (Equipment page, source 'manual') are for the Owner, Company
-- Admins and Fleet Managers (meter_readings.accept). Technicians record readings
-- through a work order; operators through a pre-start (13 Nov 2026, Ahmad).
create or replace function app.meter_readings_direct_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'manual' and auth.uid() is not null and not app.has_capability(new.organisation_id, 'meter_readings.accept') then
    perform app.raise('forbidden', 'Readings are recorded by managers here. Record them in a work order or a pre-start.');
  end if;
  return new;
end $$;
create trigger meter_readings_direct_guard before insert on public.meter_readings
  for each row execute function app.meter_readings_direct_guard();

-- Completing a work order records its odometer / hour meter readings on the
-- equipment (source 'work_order'). A lower reading waits for a manager.
create or replace function app.work_orders_record_readings() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref text := 'Recorded in work order WO-' || lpad(new.number::text, 4, '0');
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- A reading that can't be recorded (e.g. a unit the equipment doesn't track)
    -- never blocks completing the job; it stays on the work order.
    if new.odometer_km is not null then
      begin
        perform public.record_meter_reading(new.asset_id, 'km', new.odometer_km, coalesce(new.completed_at, now()), 'work_order', null, v_ref, true);
      exception when others then
        raise notice 'work order % km reading not recorded: %', new.id, sqlerrm;
      end;
    end if;
    if new.engine_hours is not null then
      begin
        perform public.record_meter_reading(new.asset_id, 'hours', new.engine_hours, coalesce(new.completed_at, now()), 'work_order', null, v_ref, true);
      exception when others then
        raise notice 'work order % hours reading not recorded: %', new.id, sqlerrm;
      end;
    end if;
  end if;
  return null;
end $$;
create trigger work_orders_record_readings after update on public.work_orders
  for each row execute function app.work_orders_record_readings();
