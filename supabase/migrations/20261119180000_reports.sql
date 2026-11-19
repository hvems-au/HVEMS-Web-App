-- =============================================================================
-- 2C Reports (CS-24, spec RPT-02/05, AUD-01):
-- * Every report export is recorded in the audit history (who, which report,
--   how many rows, which filters). Exports need reports.export.
-- * Deferred defects show who approved the deferral: defects keep deferred_by /
--   deferred_at, set by the database whenever the repair due date is deferred.
-- =============================================================================

alter table public.defects
  add column deferred_by uuid references auth.users (id) on delete set null,
  add column deferred_at timestamptz;
create index defects_deferred_by_idx on public.defects (deferred_by);

create or replace function app.defects_stamp_deferral() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deferred_until is distinct from old.deferred_until and new.deferred_until is not null then
    new.deferred_by := auth.uid();
    new.deferred_at := now();
  end if;
  return new;
end $$;
create trigger defects_stamp_deferral before update of deferred_until on public.defects
  for each row execute function app.defects_stamp_deferral();

-- Existing deferrals: take the approver and time from the audit history.
update public.defects d
set deferred_by = e.actor_user_id, deferred_at = e.occurred_at
from (
  select distinct on (entity_id) entity_id, actor_user_id, occurred_at
  from public.audit_events
  where action = 'defer' and entity_type = 'defects'
  order by entity_id, occurred_at desc
) e
where e.entity_id = d.id and d.deferred_until is not null and d.deferred_by is null;

-- Record a report export (AUD-01). The CSV itself is built from what the person may read (RLS).
create or replace function public.log_report_export(p_organisation_id uuid, p_report text, p_rows integer, p_filters jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_capability(p_organisation_id, 'reports.export');
  if p_report is null or p_report !~ '^[a-z0-9_-]{2,60}$' then
    perform app.raise('invalid_report', 'Unknown report');
  end if;
  perform app.audit('export', 'report', null, p_organisation_id, '{}'::jsonb,
    jsonb_build_object('report', p_report, 'rows', coalesce(p_rows, 0), 'filters', coalesce(p_filters, '{}'::jsonb)));
end $$;
revoke execute on function public.log_report_export(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.log_report_export(uuid, text, integer, jsonb) to authenticated, service_role;
