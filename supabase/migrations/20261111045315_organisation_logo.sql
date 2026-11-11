-- Company logo (11 Nov 2026): set in Settings by people who manage the
-- organisation's settings; printed on equipment QR labels in place of the
-- company name. Stored in a private bucket under <organisation>/logo-<id>.png.

alter table public.organisations
  add column logo_path text check (logo_path is null or char_length(logo_path) <= 200);

grant update (logo_path) on public.organisations to authenticated;

-- The logo must live in the organisation's own folder.
create or replace function app.organisations_valid_logo() returns trigger
language plpgsql stable set search_path = '' as $$
begin
  if new.logo_path is not null and new.logo_path !~ ('^' || new.id::text || '/logo-[A-Za-z0-9-]{1,64}\.(png|jpg)$') then
    perform app.raise('invalid_logo', 'The logo must be uploaded to this organisation''s folder');
  end if;
  return new;
end $$;

create trigger organisations_valid_logo before insert or update of logo_path on public.organisations
  for each row execute function app.organisations_valid_logo();

-- Private bucket; PNG or JPEG only (labels are PDFs), up to 2 MB.
-- Skipped where the storage schema doesn't exist (local test database).
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('organisation-logos', 'organisation-logos', false, 2097152, array['image/png', 'image/jpeg'])
    on conflict (id) do nothing;

    execute $p$
      create policy organisation_logos_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'organisation-logos'
        and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('org.settings.manage'))::text[])
      )$p$;
    execute $p$
      create policy organisation_logos_delete on storage.objects for delete to authenticated using (
        bucket_id = 'organisation-logos'
        and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('org.settings.manage'))::text[])
      )$p$;
    execute $p$
      create policy organisation_logos_view on storage.objects for select to authenticated using (
        bucket_id = 'organisation-logos'
        and ((storage.foldername(name))[1] = any ((select app.member_orgs())::text[])
             or (select app.is_platform_staff()))
      )$p$;
  end if;
end $do$;
