-- =============================================================================
-- 2D Marketplace: the poster sees the business name of each provider in its
-- question threads (organisation rows aren't readable across organisations).
-- =============================================================================
create or replace function public.marketplace_thread_providers(p_job_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j public.marketplace_jobs%rowtype;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  if not (app.has_capability(j.organisation_id, 'marketplace.post') or app.has_capability(j.organisation_id, 'marketplace.accept')
          or app.has_capability(j.organisation_id, 'work_orders.manage')) then
    perform app.raise('forbidden', 'You can''t see this job');
  end if;
  return query
  select jsonb_build_object('id', o.id, 'name', o.name,
           'verified', exists (select 1 from public.provider_profiles pp where pp.organisation_id = o.id and pp.status = 'verified'))
  from public.organisations o
  where o.id in (select m.provider_id from public.marketplace_messages m where m.job_id = j.id
                 union select p.provider_id from public.marketplace_proposals p where p.job_id = j.id);
end $$;
revoke execute on function public.marketplace_thread_providers(uuid) from public, anon;
grant execute on function public.marketplace_thread_providers(uuid) to authenticated, service_role;
