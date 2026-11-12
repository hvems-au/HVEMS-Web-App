-- =============================================================================
-- Issue categories for operator reports (12 Nov 2026, Ahmad): the operator says
-- what kind of problem it is (breakdown, brakes, tyres, ...). Stored on the
-- defect so the Defects register, equipment pages and the operator's history can
-- show and filter by it. Pre-start faults have no category (null).
-- The category never changes severity or condition by itself; urgency does.
-- =============================================================================

alter table public.defects add column issue_category text
  check (issue_category in ('breakdown', 'engine', 'brakes', 'tyres', 'electrical', 'hydraulics', 'leak', 'damage', 'safety_equipment', 'other'));
create index defects_org_category_idx on public.defects (organisation_id, issue_category) where issue_category is not null;

-- The report with a category (new name, so positional calls to the original
-- report_issue stay unambiguous). The original signature now files under "other".
create or replace function public.submit_issue_report(
  p_category text,
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

  if p_category is null or p_category not in ('breakdown', 'engine', 'brakes', 'tyres', 'electrical', 'hydraulics', 'leak', 'damage', 'safety_equipment', 'other') then
    perform app.raise('category_required', 'Choose what kind of issue it is');
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
                              evidence_paths, client_request_id, reported_urgency, issue_category)
  values (a.organisation_id, a.id, v_severity, v_title, nullif(btrim(coalesce(p_description, '')), ''), 'operator_report', auth.uid(),
          coalesce(p_evidence, '{}'), p_client_request_id, p_urgency, p_category)
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
revoke execute on function public.submit_issue_report(text, uuid, text, text, text, text[], uuid) from public, anon;
grant execute on function public.submit_issue_report(text, uuid, text, text, text, text[], uuid) to authenticated, service_role;

-- Original signature: same rules, filed as "other".
create or replace function public.report_issue(
  p_asset_id uuid,
  p_summary text,
  p_description text default null,
  p_urgency text default 'soon',
  p_evidence text[] default '{}'::text[],
  p_client_request_id uuid default null
) returns jsonb
language sql security definer set search_path = '' as $$
  select public.submit_issue_report(p_category => 'other', p_asset_id => p_asset_id, p_summary => p_summary, p_description => p_description,
                             p_urgency => p_urgency, p_evidence => p_evidence, p_client_request_id => p_client_request_id)
$$;
