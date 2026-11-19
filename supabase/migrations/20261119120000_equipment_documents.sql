-- =============================================================================
-- 2C Documents (CS-22, spec DOC-01/03/04/06; SoW 3.8): files on equipment with
-- categories and optional expiry, reminders 30 and 7 days before expiry.
-- * Files inherit the equipment's permissions: a document is visible to whoever
--   can see the equipment (the read policy checks assets through RLS).
-- * Uploader, time and source are set by the database (DOC-04).
-- * Nothing is deleted: a document is replaced (superseded) with a reason (DOC-06).
-- * Private bucket `documents`; links are signed for 5 minutes by the app (DOC-03).
-- * Malware scanning (DOC-02) needs a scanning service: pending decision (P-07).
-- =============================================================================

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null,
  category text not null check (category in ('registration', 'insurance', 'service_record', 'inspection_report', 'warranty', 'manual', 'certificate', 'photo', 'other')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  path text not null check (char_length(path) <= 400),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  expires_on date,
  notes text check (notes is null or char_length(notes) <= 2000),
  uploaded_by uuid not null references auth.users (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  superseded_by uuid references public.documents (id),
  superseded_at timestamptz,
  superseded_reason text,
  warned_30_at timestamptz,
  warned_7_at timestamptz,
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id)
);
create index documents_asset_idx on public.documents (asset_id, organisation_id);
create index documents_org_expiry_idx on public.documents (organisation_id, expires_on) where superseded_at is null;
create index documents_uploaded_by_idx on public.documents (uploaded_by);
create index documents_superseded_by_idx on public.documents (superseded_by);
create trigger audit_documents after insert or update or delete on public.documents for each row execute function app.audit_row_change('organisation_id');
alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;
-- Inherits the equipment's visibility (assets RLS applies inside the subquery).
create policy documents_read on public.documents for select to authenticated using (
  exists (select 1 from public.assets a where a.id = documents.asset_id));

-- Add a document (assets.manage), uploaded by the browser to <org>/<asset>/...
create or replace function public.add_document(
  p_asset_id uuid, p_category text, p_title text, p_path text, p_file_name text,
  p_content_type text default null, p_size_bytes bigint default null, p_expires_on date default null,
  p_notes text default null, p_replaces uuid default null, p_replace_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.assets%rowtype;
  old public.documents%rowtype;
  v_id uuid;
begin
  select * into a from public.assets where id = p_asset_id;
  if a.id is null then
    perform app.raise('not_found', 'Equipment not found');
  end if;
  perform app.require_capability(a.organisation_id, 'assets.manage');
  if left(coalesce(p_path, ''), char_length(a.organisation_id::text || '/' || a.id::text || '/')) <> a.organisation_id::text || '/' || a.id::text || '/'
     or p_path like '%..%' then
    perform app.raise('invalid_file', 'The file was not uploaded for this equipment');
  end if;
  if coalesce(p_size_bytes, 0) > 26214400 then
    perform app.raise('file_too_large', 'Files can be up to 25 MB');
  end if;
  if p_replaces is not null then
    select * into old from public.documents where id = p_replaces and asset_id = a.id for update;
    if old.id is null or old.superseded_at is not null then
      perform app.raise('not_found', 'The document being replaced was not found');
    end if;
    if char_length(btrim(coalesce(p_replace_reason, ''))) < 3 then
      perform app.raise('reason_required', 'Say why it is being replaced');
    end if;
  end if;
  insert into public.documents (organisation_id, asset_id, category, title, path, file_name, content_type, size_bytes, expires_on, notes)
  values (a.organisation_id, a.id, p_category, btrim(p_title), p_path, btrim(p_file_name), p_content_type, p_size_bytes, p_expires_on,
          nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  if old.id is not null then
    update public.documents set superseded_by = v_id, superseded_at = now(), superseded_reason = btrim(p_replace_reason) where id = old.id;
  end if;
  return v_id;
end $$;

-- Retire a document without a replacement (still kept; reason required).
create or replace function public.supersede_document(p_document_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.documents%rowtype;
begin
  select * into d from public.documents where id = p_document_id for update;
  if d.id is null or d.superseded_at is not null then
    perform app.raise('not_found', 'Document not found');
  end if;
  perform app.require_capability(d.organisation_id, 'assets.manage');
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.raise('reason_required', 'Give a reason');
  end if;
  update public.documents set superseded_at = now(), superseded_reason = btrim(p_reason) where id = d.id;
end $$;

revoke execute on function public.add_document(uuid, text, text, text, text, text, bigint, date, text, uuid, text), public.supersede_document(uuid, text) from public, anon;
grant execute on function public.add_document(uuid, text, text, text, text, text, bigint, date, text, uuid, text), public.supersede_document(uuid, text)
  to authenticated, service_role;

-- Reminders 30 and 7 days before expiry (SoW 3.8), to the Owner, Fleet Managers
-- and Company Admins, once each.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'critical_defect', 'minor_defect', 'operator_not_fit', 'out_of_service_hold', 'needs_attention_hold',
  'breakdown', 'regulator_notice', 'alert_escalated', 'credential_expiring', 'credential_expired', 'support_access_started',
  'prestart_missed', 'meter_reading_review', 'parts_approval', 'parts_decision', 'document_expiring'));

create or replace function app.notify_document_expiry() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_count integer := 0;
  r record;
begin
  for r in
    select d.id, d.organisation_id, d.asset_id, d.title, d.expires_on, a.asset_number,
           (d.expires_on <= v_today + 7) as within_7
    from public.documents d
    join public.assets a on a.id = d.asset_id and a.archived_at is null
    where d.superseded_at is null and d.expires_on is not null and d.expires_on >= v_today
      and ((d.expires_on <= v_today + 7 and d.warned_7_at is null) or (d.expires_on <= v_today + 30 and d.warned_30_at is null))
  loop
    perform app.notify(r.organisation_id, 'document_expiring',
      format('%s: %s expires on %s', r.asset_number, r.title, to_char(r.expires_on, 'DD/MM/YYYY')),
      'Upload the renewed document on the equipment page (Documents).', r.asset_id, true);
    update public.documents set warned_30_at = coalesce(warned_30_at, now()), warned_7_at = case when r.within_7 then now() else warned_7_at end
    where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function app.notify_document_expiry() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('hvems-document-expiry', '10 21 * * *', 'select app.notify_document_expiry()');
  end if;
end $do$;

-- Private bucket; path <organisation>/<asset>/<file>. Skipped where storage doesn't exist (tests).
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documents', 'documents', false, 26214400,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'])
    on conflict (id) do nothing;
    execute $p$
      create policy documents_upload on storage.objects for insert to authenticated with check (
        bucket_id = 'documents' and (storage.foldername(name))[1] = any ((select app.orgs_with_capability('assets.manage'))::text[])
      )$p$;
    execute $p$
      create policy documents_view on storage.objects for select to authenticated using (
        bucket_id = 'documents'
        and ((storage.foldername(name))[1] = any ((select app.orgs_with_capability('assets.view'))::text[])
             or (storage.foldername(name))[2] = any ((select app.permitted_asset_ids())::text[]))
      )$p$;
  end if;
end $do$;
