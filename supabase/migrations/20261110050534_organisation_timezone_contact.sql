-- Reconciliation §3 item 11 (ACC-04) and the timezone decision of 10 Nov 2026:
-- the platform and the Super Admin console use Australia/Brisbane; each
-- organisation chooses its own timezone (Brisbane preselected at sign-up, saved
-- straight after create_organisation), and everyone working in that
-- organisation sees its dates and times in that timezone. The billing and
-- waiver calendar stays Queensland time (SoW §5, business.timezone).
-- Organisations also get contact details.

alter table public.organisations
  add column contact_name text check (contact_name is null or char_length(contact_name) <= 200),
  add column contact_email text check (contact_email is null or (char_length(contact_email) <= 320 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column contact_phone text check (contact_phone is null or (char_length(contact_phone) <= 40 and contact_phone ~ '^[0-9 +()-]+$'));

grant update (contact_name, contact_email, contact_phone) on public.organisations to authenticated;

-- A timezone must be a real IANA name, however it is written (RPC, console or direct update).
create or replace function app.organisations_valid_timezone() returns trigger
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    perform app.raise('invalid_timezone', 'Choose a valid timezone');
  end if;
  return new;
end $$;

create trigger organisations_valid_timezone before insert or update of timezone on public.organisations
  for each row execute function app.organisations_valid_timezone();
