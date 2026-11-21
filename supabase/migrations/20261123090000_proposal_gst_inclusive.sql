-- =============================================================================
-- Proposals state GST three ways (MKT-09): plus GST, GST included in the price,
-- or no GST. gst_applies stays as before; gst_inclusive says the amounts already
-- include it. Existing versions keep "plus GST" (gst_inclusive false).
-- =============================================================================
alter table public.marketplace_proposal_versions add column gst_inclusive boolean not null default false;
alter table public.marketplace_proposal_versions add constraint proposal_gst_inclusive check (not gst_inclusive or gst_applies);

-- Submit or revise: p.gst_inclusive (with gst_applies) records that the price includes GST.
create or replace function public.submit_marketplace_proposal(p_provider_id uuid, p_job_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  pr public.marketplace_proposals%rowtype;
  v_block text;
  v_minutes integer;
  v_until timestamptz;
  v_fee bigint;
  v_badge text;
begin
  perform app.require_capability(p_provider_id, 'provider.proposals.manage');
  v_block := app.provider_proposal_block(p_provider_id);
  if v_block is not null then perform app.raise('not_eligible', v_block); end if;
  select * into j from public.marketplace_jobs where id = p_job_id for update;
  if j.id is null or not app.provider_can_see_job(p_provider_id, j) then perform app.raise('not_found', 'This job isn''t available'); end if;
  if j.status <> 'open' or j.closes_at <= now() then perform app.raise('job_closed', 'This job is no longer taking proposals'); end if;
  foreach v_badge in array j.required_badges loop
    if not exists (select 1 from public.provider_badges b where b.organisation_id = p_provider_id and b.kind = v_badge and b.revoked_at is null
                   and (b.expires_on is null or b.expires_on >= (now() at time zone 'Australia/Brisbane')::date)) then
      perform app.raise('badge_required', 'This job needs a verified ' || replace(v_badge, '_', ' ') || ' badge');
    end if;
  end loop;
  if not coalesce((p ->> 'fee_consent')::boolean, false) then
    perform app.raise('fee_consent_required', 'Agree to the connection fee to submit');
  end if;
  if (p ->> 'gst_applies') is null then perform app.raise('gst_required', 'Say whether GST applies'); end if;

  if j.urgency = 'urgent' then
    if nullif(p ->> 'arrival_minutes', '') is null then perform app.raise('arrival_required', 'Give your arrival time in minutes'); end if;
    v_minutes := coalesce(nullif(p ->> 'valid_minutes', '')::integer, app.setting_int('marketplace.urgent_proposal_validity_default_minutes'), 60);
    if v_minutes not between 15 and 240 then perform app.raise('invalid_validity', 'Urgent proposals are valid for 15 to 240 minutes'); end if;
  else
    if nullif(p ->> 'available_from', '') is null then perform app.raise('availability_required', 'Give the dates you can do the work'); end if;
    v_minutes := coalesce(nullif(p ->> 'valid_minutes', '')::integer, coalesce(app.setting_int('marketplace.proposal_validity_default_hours'), 72) * 60);
    if v_minutes not between 60 and 20160 then perform app.raise('invalid_validity', 'Proposals are valid for 1 hour to 14 days'); end if;
  end if;
  v_until := now() + make_interval(mins => v_minutes);
  v_fee := case when j.urgency = 'urgent' then app.setting_int('pricing.connection_fee_urgent_cents') else app.setting_int('pricing.connection_fee_standard_cents') end;

  select * into pr from public.marketplace_proposals where job_id = j.id and provider_id = p_provider_id for update;
  if pr.id is null then
    insert into public.marketplace_proposals (job_id, provider_id, valid_until) values (j.id, p_provider_id, v_until) returning * into pr;
  else
    if pr.status in ('accepted', 'not_selected') then perform app.raise('invalid_status', 'This proposal can no longer be changed'); end if;
    update public.marketplace_proposals set version = version + 1, status = 'active', valid_until = v_until, updated_at = now()
    where id = pr.id returning * into pr;
  end if;
  insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, amount_max_cents, hourly_rate_cents, callout_cents,
    gst_applies, gst_inclusive, available_from, available_to, arrival_minutes, valid_until, inclusions, exclusions, assumptions, note, fee_cents, fee_consented_at)
  values (pr.id, pr.version, p ->> 'price_basis', nullif(p ->> 'amount_cents', '')::bigint, nullif(p ->> 'amount_max_cents', '')::bigint,
    nullif(p ->> 'hourly_rate_cents', '')::bigint, nullif(p ->> 'callout_cents', '')::bigint, (p ->> 'gst_applies')::boolean,
    coalesce((p ->> 'gst_applies')::boolean, false) and coalesce((p ->> 'gst_inclusive')::boolean, false),
    nullif(p ->> 'available_from', '')::date, nullif(p ->> 'available_to', '')::date, nullif(p ->> 'arrival_minutes', '')::integer, v_until,
    nullif(btrim(coalesce(p ->> 'inclusions', '')), ''), nullif(btrim(coalesce(p ->> 'exclusions', '')), ''),
    nullif(btrim(coalesce(p ->> 'assumptions', '')), ''), nullif(btrim(coalesce(p ->> 'note', '')), ''), v_fee, now());

  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select j.organisation_id, m.user_id, 'marketplace_proposal',
         case when pr.version = 1 then 'New proposal on ' else 'Revised proposal on ' end || j.title,
         (select o.name from public.organisations o where o.id = p_provider_id), 'marketplace/' || j.id
  from public.org_memberships m
  where m.organisation_id = j.organisation_id and m.status = 'active' and (m.user_id = j.posted_by or m.role in ('owner', 'account_owner'));
  return pr.id;
end $$;
