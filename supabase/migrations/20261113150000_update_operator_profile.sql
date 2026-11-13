-- Edit an operator's name and phone (drivers.manage). The name also updates the
-- operator's login profile, so it reads the same everywhere. Audited by the
-- existing audit trigger on driver_profiles (13 Nov 2026, Ahmad).
create or replace function public.update_driver_profile(p_driver_id uuid, p_full_name text, p_phone text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.driver_profiles%rowtype;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into d from public.driver_profiles where id = p_driver_id for update;
  if d.id is null then
    perform app.raise('not_found', 'Operator not found');
  end if;
  perform app.require_capability(d.organisation_id, 'drivers.manage');
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    perform app.raise('name_required', 'Enter the operator''s full name');
  end if;
  if v_phone is not null and (char_length(v_phone) > 40 or v_phone !~ '^[0-9 +()-]+$') then
    perform app.raise('invalid_phone', 'Enter a phone number using digits, spaces, + ( ) or -');
  end if;
  update public.driver_profiles set full_name = v_name, phone = v_phone where id = d.id;
  if d.user_id is not null then
    update public.profiles set full_name = v_name where id = d.user_id;
  end if;
end $$;
revoke execute on function public.update_driver_profile(uuid, text, text) from public, anon;
grant execute on function public.update_driver_profile(uuid, text, text) to authenticated, service_role;
