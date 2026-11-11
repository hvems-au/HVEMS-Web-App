-- Support access (reconciliation §3 item 5, ADM-07, NOT-01).
-- * Sessions last at most 60 minutes (setting; was 240).
-- * Read-only: support sessions only ever widen SELECT policies; no write path.
-- * The company's Owner is notified when a session starts, sees every session,
--   and can end one at any time. Each step is a security event.

insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('support_access.max_minutes', '60', 'Longest single support-access session HVEMS staff can open', 'confirmed', 'ADM-07')
on conflict (key) do update set value = excluded.value, status = excluded.status, sow_reference = excluded.sow_reference;

alter table public.support_access_grants add column ended_by uuid references auth.users (id) on delete set null;
create index support_access_ended_by_idx on public.support_access_grants (ended_by);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started'));

create or replace function public.start_support_access(p_organisation_id uuid, p_reason text, p_minutes integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_max integer := coalesce(app.setting_int('support_access.max_minutes'), 60);
  v_staff text;
begin
  if not app.is_platform_staff(array['platform_administrator', 'support_agent']::public.platform_role[]) then
    perform app.raise('forbidden', 'HVEMS staff with MFA only');
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > v_max then
    perform app.raise('invalid_duration', format('Support access can last between 1 and %s minutes', v_max));
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    perform app.raise('reason_required', 'Give the reason for support access (at least 10 characters)');
  end if;
  if exists (select 1 from public.support_access_grants where staff_user_id = auth.uid() and organisation_id = p_organisation_id
             and ended_at is null and expires_at > now()) then
    perform app.raise('already_active', 'You already have an active support session for this organisation');
  end if;
  insert into public.support_access_grants (staff_user_id, organisation_id, reason, expires_at)
  values (auth.uid(), p_organisation_id, btrim(p_reason), now() + make_interval(mins => p_minutes))
  returning id into v_id;
  perform app.security_event('support_access_started', p_organisation_id,
    jsonb_build_object('grant_id', v_id, 'minutes', p_minutes, 'reason', btrim(p_reason)), auth.uid());

  -- NOT-01: the Owner (anyone who can see support access) is told straight away.
  select coalesce(nullif(full_name, ''), email::text) into v_staff from public.profiles where id = auth.uid();
  insert into public.notifications (organisation_id, recipient_id, kind, title, body)
  select p_organisation_id, m.user_id, 'support_access_started',
         format('HVEMS support (%s) can view your records for %s minutes', coalesce(v_staff, 'HVEMS staff'), p_minutes),
         format('Reason: %s. Read-only. You can end it from the Team page.', btrim(p_reason))
  from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.status = 'active'
    and exists (select 1 from app.role_capabilities rc where rc.role = m.role and rc.capability = 'support_access.view');
  return v_id;
end $$;

create or replace function public.end_support_access(p_grant_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  update public.support_access_grants set ended_at = now(), ended_by = auth.uid()
  where id = p_grant_id and staff_user_id = auth.uid() and ended_at is null
  returning organisation_id into v_org;
  if v_org is not null then
    perform app.security_event('support_access_ended', v_org, jsonb_build_object('grant_id', p_grant_id), auth.uid());
  end if;
end $$;

-- The Owner ends an HVEMS support session for their organisation.
create or replace function public.owner_end_support_access(p_grant_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.support_access_grants%rowtype;
begin
  select * into g from public.support_access_grants where id = p_grant_id;
  if g.id is null then
    perform app.raise('not_found', 'Support session not found');
  end if;
  perform app.require_capability(g.organisation_id, 'support_access.view');
  if g.ended_at is not null or g.expires_at <= now() then
    return;
  end if;
  update public.support_access_grants set ended_at = now(), ended_by = auth.uid() where id = g.id;
  perform app.security_event('support_access_ended_by_owner', g.organisation_id,
    jsonb_build_object('grant_id', g.id, 'member_user_id', g.staff_user_id), auth.uid());
end $$;

revoke execute on function public.owner_end_support_access(uuid) from public, anon;
grant execute on function public.owner_end_support_access(uuid) to authenticated, service_role;
