-- Alerts is now called Notifications in the web app: the escalation message points there.
create or replace function app.escalate_alerts(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_first integer := coalesce(app.setting_int('alerts.escalate_first_minutes'), 30);
  v_second integer := coalesce(app.setting_int('alerts.escalate_second_minutes'), 120);
  v_n integer := 0;
begin
  for a in
    select * from public.critical_alerts
    where acknowledged_at is null
      and ((escalation_level = 0 and raised_at <= p_now - make_interval(mins => v_first))
        or (escalation_level = 1 and raised_at <= p_now - make_interval(mins => v_second)))
    for update skip locked
  loop
    update public.critical_alerts set escalation_level = escalation_level + 1, last_escalated_at = p_now where id = a.id;
    perform app.notify(a.organisation_id, 'alert_escalated',
      case when a.escalation_level = 0 then format('Not yet acknowledged (%s min): %s', v_first, a.title)
           else format('URGENT, %s hours without acknowledgement: %s', round(v_second / 60.0, 1), a.title) end,
      'Open Notifications and acknowledge it so everyone knows it is being handled.',
      a.asset_id, true, a.id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Existing escalation notices say the same.
update public.notifications set body = 'Open Notifications and acknowledge it so everyone knows it is being handled.'
where kind = 'alert_escalated' and body = 'Open Alerts and acknowledge it so everyone knows it is being handled.';
