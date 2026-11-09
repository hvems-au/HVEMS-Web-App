-- Super Admin organisation management (spec ADM-02, ACC-18, Appendix B.5).
--  * Edit an organisation's details (name, legal name, ABN, timezone).
--  * Suspend ("de-activate") or reinstate an organisation, with a reason.
-- Platform Administrators (Super Admin) only, with an MFA session; Support
-- Agents can't suspend (B.5). Members still can't change `status`: their
-- column grant on organisations excludes it.
--
-- What suspension does (ACC-18): no new equipment, invitations or members, and
-- (from 2D) no job posting, accepting or proposing. Sign-in and safety
-- functions (inspections, defects, condition, clearance) keep working, so a
-- suspended fleet is never left without its safety records.

alter table public.organisations
  add column suspended_at timestamptz,
  add column suspension_reason text
    check (suspension_reason is null or char_length(btrim(suspension_reason)) between 10 and 1000),
  add constraint organisations_suspension_consistent
    check ((status = 'suspended') = (suspended_at is not null and suspension_reason is not null));

-- ---------------------------------------------------------------------------
-- Edit details
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_organisation(
  p_organisation_id uuid, p_name text, p_legal_name text, p_abn text, p_timezone text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organisations;
  v_abn text := nullif(regexp_replace(coalesce(p_abn, ''), '\s', '', 'g'), '');
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Super Admin signed in with MFA can change organisations');
  end if;
  select * into v_org from public.organisations where id = p_organisation_id for update;
  if not found then
    perform app.raise('not_found', 'Organisation not found');
  end if;
  if v_org.status in ('closing', 'closed') then
    perform app.raise('organisation_closed', 'A closed organisation can''t be changed');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 200 then
    perform app.raise('invalid_name', 'Enter a name between 2 and 200 characters');
  end if;
  if char_length(btrim(coalesce(p_legal_name, ''))) > 200 then
    perform app.raise('invalid_legal_name', 'The legal name can be at most 200 characters');
  end if;
  if v_abn is not null and not app.is_valid_abn(v_abn) then
    perform app.raise('invalid_abn', 'The ABN is not valid');
  end if;
  if v_org.kind = 'provider' and v_abn is null then
    perform app.raise('abn_required', 'Provider accounts need an ABN');
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    perform app.raise('invalid_timezone', 'Choose a valid timezone');
  end if;

  update public.organisations
  set name = btrim(p_name),
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      abn = v_abn,
      timezone = p_timezone
  where id = p_organisation_id;
end $$;

-- ---------------------------------------------------------------------------
-- Suspend / reinstate
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_organisation_suspended(
  p_organisation_id uuid, p_suspend boolean, p_reason text
) returns public.organisation_status
language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organisations;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not app.is_platform_staff(array['platform_administrator']::public.platform_role[]) then
    perform app.raise('forbidden', 'Only a Super Admin signed in with MFA can suspend or reinstate organisations');
  end if;
  if char_length(v_reason) not between 10 and 1000 then
    perform app.raise('reason_required', 'Give a reason of at least 10 characters');
  end if;
  select * into v_org from public.organisations where id = p_organisation_id for update;
  if not found then
    perform app.raise('not_found', 'Organisation not found');
  end if;
  if v_org.status in ('closing', 'closed') then
    perform app.raise('organisation_closed', 'A closed organisation can''t be suspended or reinstated');
  end if;

  if p_suspend then
    if v_org.status = 'suspended' then
      perform app.raise('already_suspended', 'This organisation is already suspended');
    end if;
    update public.organisations
    set status = 'suspended', suspended_at = now(), suspension_reason = v_reason
    where id = p_organisation_id;
  else
    if v_org.status <> 'suspended' then
      perform app.raise('not_suspended', 'This organisation isn''t suspended');
    end if;
    -- Billing restrictions (2D) are recalculated by the billing jobs; reinstating
    -- only lifts the suspension.
    update public.organisations
    set status = 'active', suspended_at = null, suspension_reason = null
    where id = p_organisation_id;
  end if;

  -- The row trigger records the status change; this event keeps the reason,
  -- including for reinstatements, where the stored reason is cleared.
  perform app.audit(case when p_suspend then 'suspend' else 'reinstate' end, 'organisations',
    p_organisation_id, p_organisation_id, jsonb_build_object('reason', v_reason));
  return (select status from public.organisations where id = p_organisation_id);
end $$;

-- ---------------------------------------------------------------------------
-- What a suspension blocks (ACC-18). Safety records are deliberately not blocked.
-- ---------------------------------------------------------------------------
create or replace function app.block_when_suspended() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.organisations where id = new.organisation_id and status = 'suspended') then
    perform app.raise('account_suspended', 'This account is suspended by HVEMS: ' || tg_argv[0]);
  end if;
  return new;
end $$;

create trigger assets_block_when_suspended before insert on public.assets
  for each row execute function app.block_when_suspended('new equipment can''t be added');
create trigger invitations_block_when_suspended before insert on public.invitations
  for each row execute function app.block_when_suspended('new members can''t be invited');
create trigger memberships_block_when_suspended before insert on public.org_memberships
  for each row execute function app.block_when_suspended('new members can''t join');

revoke execute on function
  public.admin_update_organisation(uuid, text, text, text, text),
  public.admin_set_organisation_suspended(uuid, boolean, text)
from public, anon;
grant execute on function
  public.admin_update_organisation(uuid, text, text, text, text),
  public.admin_set_organisation_suspended(uuid, boolean, text)
to authenticated;
revoke execute on function app.block_when_suspended() from public, anon;
