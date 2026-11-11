-- HVEMS staff accounts are kept separate from customer accounts (reconciliation
-- §3, ADM-01): a staff login can't join, create or be invited into a company,
-- marketplace or provider organisation, and a person who belongs to one can't
-- be made HVEMS staff. Staff reach customer records only through the console
-- (O-05, support access), never as members.

create or replace function app.memberships_not_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'removed' and exists (select 1 from public.platform_staff s where s.user_id = new.user_id) then
    perform app.raise('staff_account',
      'HVEMS staff accounts can''t belong to a customer organisation. Use a separate login for customer work.');
  end if;
  return new;
end $$;
create trigger org_memberships_not_staff before insert or update of user_id, status on public.org_memberships
  for each row execute function app.memberships_not_staff();

create or replace function app.staff_not_members() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.org_memberships m where m.user_id = new.user_id and m.status <> 'removed') then
    perform app.raise('member_account',
      'This person belongs to a customer organisation. HVEMS staff need a separate login.');
  end if;
  return new;
end $$;
create trigger platform_staff_not_members before insert or update of user_id on public.platform_staff
  for each row execute function app.staff_not_members();

revoke execute on function app.memberships_not_staff(), app.staff_not_members() from public, anon;
