-- Wording: "Operator" replaces "Driver" in credential alerts. Sorts after support_pin,
-- which last defined this function. (Applied on the hosted project together with
-- current_operator_custom_prestart; recorded separately so fresh databases match.)
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
        format('It expired on %s. Update it on the Operators page once renewed.', to_char(r.expires_on, 'DD/MM/YYYY')), null, true);
      update public.driver_credentials set expired_notified_at = now(), warned_at = coalesce(warned_at, now()) where id = r.id;
    else
      perform app.notify(r.organisation_id, 'credential_expiring',
        format('%s''s %s expires on %s', r.full_name, app.credential_label(r.kind, r.label), to_char(r.expires_on, 'DD/MM/YYYY')),
        'Update it on the Operators page once renewed.', null, true);
      update public.driver_credentials set warned_at = now() where id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function app.notify_credential_expiry() from public, anon, authenticated;

update public.platform_settings set description = 'Operator profile lockout duration' where key = 'security.driver_pin_lockout_minutes';
