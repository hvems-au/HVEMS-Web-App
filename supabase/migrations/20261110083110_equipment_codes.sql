-- =============================================================================
-- Equipment QR codes (2B; CS-10). Decision O-10 (10 Nov 2026, Ahmad):
-- * A code is created only when a manager presses "Generate QR code" on the
--   equipment; it belongs to that equipment only.
-- * Scanning it opens the pre-start for that equipment; the operator must sign
--   in (Driver ID + PIN, or their own login) so every pre-start records who did
--   it. There is no anonymous "report a problem" page.
-- * Each code has a 128-bit token for the QR URL and a 10-character code for
--   typing (no 0/O/1/I/L). Archiving revokes it; "Replace code" revokes and
--   issues a new one (lost or damaged label).
-- =============================================================================

create table public.equipment_codes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  asset_id uuid not null,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  short_code text not null unique check (short_code ~ '^[A-HJKMNP-Z2-9]{10}$'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create unique index equipment_codes_one_active on public.equipment_codes (asset_id) where revoked_at is null;
create index equipment_codes_asset_org_idx on public.equipment_codes (asset_id, organisation_id);
create index equipment_codes_org_idx on public.equipment_codes (organisation_id);
create index equipment_codes_created_by_idx on public.equipment_codes (created_by);

alter table public.equipment_codes enable row level security;
create policy equipment_codes_read on public.equipment_codes for select to authenticated using (
  organisation_id = any ((select app.orgs_with_capability('assets.view'))::uuid[]) or asset_id = any ((select app.permitted_asset_ids())::uuid[]));
create policy equipment_codes_read_super_admin on public.equipment_codes for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
revoke all on public.equipment_codes from anon, authenticated;
grant select on public.equipment_codes to authenticated;

create or replace function app.new_short_code() returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(10);
  out text := '';
begin
  for i in 0..9 loop
    out := out || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function app.issue_equipment_code(p_asset_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  v_id uuid;
begin
  select * into a from public.assets where id = p_asset_id;
  for attempt in 1..5 loop
    begin
      insert into public.equipment_codes (organisation_id, asset_id, token, short_code, created_by)
      values (a.organisation_id, a.id,
              translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_'),
              app.new_short_code(), auth.uid())
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      if exists (select 1 from public.equipment_codes where asset_id = a.id and revoked_at is null) then
        perform app.raise('code_exists', 'This equipment already has a QR code');
      end if;
      -- Otherwise a random collision: try again.
    end;
  end loop;
  perform app.raise('code_generation_failed', 'Could not generate a code. Try again.');
end $$;

-- Archiving revokes the code (a label on a sold machine stops working).
create or replace function app.assets_revoke_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    update public.equipment_codes set revoked_at = now(), revoke_reason = 'archived' where asset_id = new.id and revoked_at is null;
  end if;
  return null;
end $$;
create trigger assets_revoke_code after update of archived_at on public.assets
  for each row execute function app.assets_revoke_code();

-- "Generate QR code" (and "Replace code", which needs a reason).
create or replace function public.generate_equipment_code(p_asset_id uuid, p_replace_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  v_id uuid;
  v_replacing boolean;
begin
  a := app.asset_for_safety(p_asset_id);
  perform app.require_capability(a.organisation_id, 'assets.manage');
  v_replacing := exists (select 1 from public.equipment_codes where asset_id = a.id and revoked_at is null);
  if v_replacing then
    if char_length(btrim(coalesce(p_replace_reason, ''))) < 3 then
      perform app.raise('reason_required', 'Give a reason for replacing the code');
    end if;
    update public.equipment_codes set revoked_at = now(), revoke_reason = btrim(p_replace_reason) where asset_id = a.id and revoked_at is null;
  end if;
  v_id := app.issue_equipment_code(a.id);
  perform app.audit(case when v_replacing then 'replace_code' else 'generate_code' end, 'assets', a.id, a.organisation_id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_replace_reason, '')), '')));
  return v_id;
end $$;

-- Normalise a typed code: upper case, letters and digits only.
create or replace function app.normalise_code(p text) returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function app.find_equipment_code(p_code text) returns public.equipment_codes
language sql stable security definer set search_path = '' as $$
  select c.* from public.equipment_codes c
  where c.revoked_at is null
    and (c.token = btrim(coalesce(p_code, '')) or c.short_code = app.normalise_code(p_code))
  limit 1
$$;

-- The scanned equipment, for the driver sign-in page (service role only):
-- just enough to confirm the machine before signing in.
create or replace function public.equipment_public(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.equipment_codes%rowtype;
begin
  c := app.find_equipment_code(p_code);
  if c.id is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'asset_id', a.id, 'organisation_id', a.organisation_id, 'asset_number', a.asset_number,
      'make', a.make, 'model', a.model, 'class', cl.name, 'company', o.name, 'short_code', c.short_code,
      'condition', a.condition)
    from public.assets a
    join public.organisations o on o.id = a.organisation_id and o.status <> 'closed'
    join public.asset_classes cl on cl.id = a.asset_class_id
    where a.id = c.asset_id and a.archived_at is null
  );
end $$;

revoke execute on function public.equipment_public(text) from public, anon, authenticated;
grant execute on function public.equipment_public(text) to service_role;
revoke execute on function public.generate_equipment_code(uuid, text) from public, anon;
grant execute on function public.generate_equipment_code(uuid, text) to authenticated;
revoke execute on function app.issue_equipment_code(uuid), app.find_equipment_code(text) from public, anon, authenticated;
