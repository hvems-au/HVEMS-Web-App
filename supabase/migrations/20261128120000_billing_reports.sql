-- Report 14 (connection fees and waivers) for billing readers.
-- Finance members can see what the organisation pays HVEMS (org.billing.view) but not
-- marketplace engagements themselves; this returns only the fee facts of each engagement
-- the organisation paid a connection fee on (as the customer or as the provider).
create or replace function public.connection_fee_rows(p_organisation_id uuid)
returns table (engagement_id uuid, engagement_number bigint, side text, job_number bigint, job_title text, urgency text,
               accepted_at timestamptz, fee_cents bigint, fee_status text, waiver_used boolean, refunded_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_capability(p_organisation_id, 'org.billing.view') then
    perform app.raise('forbidden', 'You can''t see this organisation''s billing');
  end if;
  return query
  select e.id, e.number, s.side, j.number, j.title, j.urgency, e.accepted_at,
         case when s.side = 'poster' then e.poster_fee_cents else e.provider_fee_cents end,
         e.fee_status,
         s.side = 'poster' and exists (select 1 from public.company_waivers w where w.engagement_id = e.id and w.status = 'used'),
         coalesce((select sum(a.amount_cents) from public.billing_adjustments a
                   where a.engagement_id = e.id and a.fee_side = s.side and a.kind = 'refund' and a.status = 'completed'), 0)::bigint
  from public.marketplace_engagements e
  join public.marketplace_jobs j on j.id = e.job_id
  cross join lateral (
    select 'poster'::text as side where e.organisation_id = p_organisation_id
    union all
    select 'provider' where e.provider_id = p_organisation_id
  ) s
  order by e.accepted_at desc
  limit 10000;
end $$;
revoke execute on function public.connection_fee_rows(uuid) from public, anon;
grant execute on function public.connection_fee_rows(uuid) to authenticated;
