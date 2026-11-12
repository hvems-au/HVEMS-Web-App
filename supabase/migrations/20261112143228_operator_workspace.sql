-- Operator workspace (driver/operator experience).
-- * Company-wide equipment for operators: setting organisations.operators_any_equipment
--   (default on). When on, operators may use any current (not archived) equipment of
--   their own company; when off, only the equipment/sites ticked on their profile (the
--   original rule). Never other companies. app.permitted_asset_ids() is the single
--   place this is decided; RLS, pre-start checklist and reports all use it.
-- * Company code for direct PIN sign-in (no QR scan): company code + Operator ID + PIN,
--   same checks as the equipment-code sign-in (lockout, PIN setup, security events).
-- * Standalone issue reports: public.report_issue writes into the existing defects
--   table (source 'operator_report'), with the operator's urgency mapped to the existing
--   severities, condition causes and alerts, exactly like pre-start faults. Managers
--   triage, repair and clear them in the existing Defects workflow. Idempotent per
--   client request id.
-- * Operators always see the issues they reported, whatever their equipment access.

-- ---------------------------------------------------------------------------
-- Company settings: any equipment, company code
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column operators_any_equipment boolean not null default true,
  add column operator_code text;
comment on column public.organisations.operators_any_equipment is 'Operators may use any current equipment of the company (else only equipment ticked on their profile).';
comment on column public.organisations.operator_code is 'Company code operators type with their Operator ID and PIN when signing in without scanning equipment.';

create or replace function app.new_operator_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v text;
begin
  loop
    v := '';
    for i in 1..6 loop
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.organisations where operator_code = v);
  end loop;
  return v;
end $$;
revoke execute on function app.new_operator_code() from public, anon, authenticated;

update public.organisations set operator_code = app.new_operator_code() where kind = 'company' and operator_code is null;
create unique index organisations_operator_code_key on public.organisations (operator_code) where operator_code is not null;

create or replace function app.organisations_operator_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'company' and new.operator_code is null then
    new.operator_code := app.new_operator_code();
  end if;
  return new;
end $$;
revoke execute on function app.organisations_operator_code() from public, anon, authenticated;
create trigger organisations_operator_code before insert on public.organisations
  for each row execute function app.organisations_operator_code();

-- Managers choose company-wide or per-operator equipment access (audited via the organisations audit trigger).
create or replace function public.set_operator_equipment_access(p_organisation_id uuid, p_any boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_capability(p_organisation_id, 'drivers.manage');
  update public.organisations set operators_any_equipment = coalesce(p_any, true) where id = p_organisation_id;
end $$;
revoke execute on function public.set_operator_equipment_access(uuid, boolean) from public, anon;
grant execute on function public.set_operator_equipment_access(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Which equipment an operator may use
-- ---------------------------------------------------------------------------
create or replace function app.permitted_asset_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.id), '{}')
  from public.org_memberships m
  join public.organisations o on o.id = m.organisation_id
  join public.assets a on a.organisation_id = m.organisation_id
  where m.user_id = auth.uid() and m.status = 'active'
    and (
      (o.operators_any_equipment and a.archived_at is null)
      or exists (select 1 from public.asset_operator_permissions p
                 where p.membership_id = m.id and (p.asset_id = a.id or (p.site_id is not null and a.site_id = p.site_id)))
    )
$$;

-- ---------------------------------------------------------------------------
-- Direct PIN sign-in (company code) sharing the equipment-code sign-in logic
-- ---------------------------------------------------------------------------
create or replace function app.operator_pin_sign_in(p_org uuid, p_driver_number integer, p_secret text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.driver_profiles%rowtype;
  v_ok boolean;
  v_max integer := coalesce(app.setting_int('drivers.max_pin_attempts'), 5);
  v_lock integer := coalesce(app.setting_int('drivers.lockout_minutes'), 15);
  v_setup boolean;
begin
  select * into d from public.driver_profiles
  where organisation_id = p_org and driver_number = p_driver_number for update;
  if d.id is null or not d.active or d.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_credentials', 'message', 'Operator ID or PIN is not right');
  end if;
  if d.locked_until is not null and d.locked_until > now() then
    perform app.raise('driver_locked', format('Too many wrong attempts. Try again after %s or ask your manager to reset your PIN.',
      to_char(d.locked_until at time zone coalesce((select timezone from public.organisations where id = p_org), 'Australia/Brisbane'), 'HH24:MI')));
  end if;

  v_setup := p_new_pin is not null;
  if v_setup then
    v_ok := d.setup_code_hash is not null and d.setup_expires_at > now()
            and d.setup_code_hash = extensions.crypt(upper(btrim(coalesce(p_secret, ''))), d.setup_code_hash);
  else
    v_ok := d.pin_hash is not null and d.pin_hash = extensions.crypt(coalesce(p_secret, ''), d.pin_hash);
  end if;

  if not v_ok then
    if d.locked_until is not null then
      d.failed_attempts := 0;
    end if;
    update public.driver_profiles
    set failed_attempts = d.failed_attempts + 1,
        locked_until = case when d.failed_attempts + 1 >= v_max then now() + make_interval(mins => v_lock) else null end
    where id = d.id;
    insert into public.security_events (user_id, organisation_id, event_type, detail)
    values (d.user_id, d.organisation_id, 'driver_sign_in_failed', jsonb_build_object('driver_id', d.id, 'setup', v_setup));
    return jsonb_build_object('ok', false,
      'code', case when not v_setup and d.pin_hash is null then 'pin_not_set' else 'invalid_credentials' end,
      'message', case when not v_setup and d.pin_hash is null then 'Set up your PIN first with the setup code from your manager'
                      when v_setup then 'Operator ID or setup code is not right, or the code has expired'
                      else 'Operator ID or PIN is not right' end);
  end if;

  if v_setup then
    if p_new_pin !~ '^\d{6}$' or p_new_pin ~ '^(\d)\1{5}$' or p_new_pin in ('123456', '654321', '012345', '123123') then
      perform app.raise('weak_pin', 'Choose a 6-digit PIN that isn''t easy to guess');
    end if;
    update public.driver_profiles
    set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)), setup_code_hash = null, setup_expires_at = null
    where id = d.id;
  end if;
  update public.driver_profiles set failed_attempts = 0, locked_until = null, last_sign_in_at = now() where id = d.id;
  insert into public.security_events (user_id, organisation_id, event_type, detail)
  values (d.user_id, d.organisation_id, case when v_setup then 'driver_pin_set' else 'driver_signed_in' end, jsonb_build_object('driver_id', d.id));
  return jsonb_build_object('ok', true, 'user_id', d.user_id, 'organisation_id', d.organisation_id, 'driver_id', d.id, 'full_name', d.full_name);
end $$;
revoke execute on function app.operator_pin_sign_in(uuid, integer, text, text) from public, anon, authenticated;

-- Equipment-code sign-in (QR labels) now shares the logic above.
create or replace function public.driver_sign_in(p_code text, p_driver_number integer, p_secret text, p_new_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.equipment_codes%rowtype;
begin
  c := app.find_equipment_code(p_code);
  if c.id is null then
    perform app.raise('code_not_found', 'That equipment code is not valid');
  end if;
  return app.operator_pin_sign_in(c.organisation_id, p_driver_number, p_secret, p_new_pin);
end $$;

-- Direct sign-in: company code + Operator ID + PIN (service role only, like driver_sign_in).
create or replace function public.operator_sign_in(p_company_code text, p_driver_number integer, p_secret text, p_new_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organisations
  where operator_code = upper(regexp_replace(coalesce(p_company_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and kind = 'company' and status not in ('closing', 'closed');
  if v_org is null then
    -- Same answer as a wrong PIN: don't reveal which company codes exist.
    return jsonb_build_object('ok', false, 'code', 'invalid_credentials', 'message', 'Company code, Operator ID or PIN is not right');
  end if;
  return app.operator_pin_sign_in(v_org, p_driver_number, p_secret, p_new_pin);
end $$;
revoke execute on function public.operator_sign_in(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.operator_sign_in(text, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Standalone issue reports
-- ---------------------------------------------------------------------------
alter table public.defects drop constraint defects_source_check;
alter table public.defects add constraint defects_source_check check (source in ('prestart', 'operator_report'));
alter table public.defects
  add column client_request_id uuid,
  add column reported_urgency text check (reported_urgency is null or reported_urgency in ('stop', 'soon', 'not_urgent'));
comment on column public.defects.reported_urgency is 'What the operator said when reporting (stop using / needs attention soon / not urgent). Severity is the authorised classification.';
create unique index defects_client_request_key on public.defects (organisation_id, client_request_id) where client_request_id is not null;

create or replace function public.report_issue(
  p_asset_id uuid,
  p_summary text,
  p_description text default null,
  p_urgency text default 'soon',
  p_evidence text[] default '{}'::text[],
  p_client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  existing public.defects%rowtype;
  v_severity public.defect_severity;
  v_id uuid;
  v_cause uuid;
  v_title text := btrim(coalesce(p_summary, ''));
  v_who text;
begin
  a := app.asset_for_safety(p_asset_id);
  perform app.require_capability(a.organisation_id, 'defects.report');
  if app.membership_role(a.organisation_id) = 'driver_operator' and not (a.id = any (app.permitted_asset_ids())) then
    perform app.raise('forbidden', 'You are not set up to use this equipment');
  end if;

  -- A retry of the same report returns the first one.
  if p_client_request_id is not null then
    select * into existing from public.defects where organisation_id = a.organisation_id and client_request_id = p_client_request_id;
    if existing.id is not null then
      return jsonb_build_object('defect_id', existing.id, 'duplicate', true);
    end if;
  end if;

  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    perform app.raise('summary_required', 'Say in a few words what the issue is');
  end if;
  if p_urgency not in ('stop', 'soon', 'not_urgent') then
    perform app.raise('urgency_required', 'Say whether it is safe to keep using');
  end if;
  if p_urgency = 'stop' and char_length(btrim(coalesce(p_description, ''))) < 3 then
    perform app.raise('description_required', 'Describe what is unsafe');
  end if;
  perform app.check_evidence(a.organisation_id, a.id, p_evidence);

  -- The operator's urgency maps to the existing severities; triage may change it.
  v_severity := case p_urgency when 'stop' then 'critical' when 'soon' then 'minor' else 'advisory' end;
  insert into public.defects (organisation_id, asset_id, severity, title, description, source, reported_by,
                              evidence_paths, client_request_id, reported_urgency)
  values (a.organisation_id, a.id, v_severity, v_title, nullif(btrim(coalesce(p_description, '')), ''), 'operator_report', auth.uid(),
          coalesce(p_evidence, '{}'), p_client_request_id, p_urgency)
  returning id into v_id;

  if v_severity in ('critical', 'minor') then
    v_cause := app.open_condition_cause(a.id,
      (case v_severity when 'critical' then 'critical_defect' else 'minor_defect' end)::public.condition_cause_kind,
      'defect', v_id);
    update public.defects set cause_id = v_cause where id = v_id;
  end if;

  select coalesce(full_name, email, 'An operator') into v_who from public.profiles where id = auth.uid();
  if v_severity = 'critical' then
    perform app.raise_critical_alert(a.organisation_id, a.id, 'critical_defect',
      format('%s reported unsafe: %s', a.asset_number, v_title),
      format('Reported by %s. The equipment is out of service until it is reviewed and cleared.', coalesce(v_who, 'an operator')),
      'defect', v_id);
  elsif v_severity = 'minor' then
    perform app.notify(a.organisation_id, 'minor_defect', format('%s: %s', a.asset_number, v_title),
      format('Reported by %s. Review it under Defects & Safety.', coalesce(v_who, 'an operator')), a.id);
  end if;
  return jsonb_build_object('defect_id', v_id, 'duplicate', false);
end $$;
revoke execute on function public.report_issue(uuid, text, text, text, text[], uuid) from public, anon;
grant execute on function public.report_issue(uuid, text, text, text, text[], uuid) to authenticated, service_role;

-- Operators always see the issues they reported, even if their equipment access changes.
alter policy defects_read on public.defects using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[])
  or ((organisation_id = any ((select app.orgs_with_capability('assets.view_permitted'))::uuid[]))
      and asset_id = any ((select app.permitted_asset_ids())::uuid[]))
  or reported_by = (select auth.uid())
);
