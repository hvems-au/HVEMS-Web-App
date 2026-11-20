-- =============================================================================
-- Decision O-13 (Ahmad, 20/11/2026): a company works the marketplace from both
-- sides in the company portal: it posts jobs and, with its own provider profile
-- and verification, quotes on and does other organisations' jobs. SoW 2.x has
-- separate provider accounts, so HVEMS acknowledges this through change control;
-- provider accounts keep working as before.
-- * Company roles get provider capabilities: Owner and Company Admin all of them;
--   Fleet Manager finds work, proposes and runs engagements; Technicians do the
--   engagement work. Verification, eligibility and fees are the same as for providers.
-- * An organisation never sees or quotes on its own jobs.
-- * Provider alerts also reach company Owners and Company Admins.
-- =============================================================================

-- BEGIN CAPABILITY SEED (matrix.ts mirror; the drift test reads every migration)
insert into app.role_capabilities (role, capability) values
  ('owner', 'provider.profile.manage'),
  ('owner', 'provider.verification.submit'),
  ('owner', 'provider.jobs.browse'),
  ('owner', 'provider.proposals.manage'),
  ('owner', 'provider.engagements.manage'),
  ('owner', 'provider.engagements.work'),
  ('administrator', 'provider.profile.manage'),
  ('administrator', 'provider.verification.submit'),
  ('administrator', 'provider.jobs.browse'),
  ('administrator', 'provider.proposals.manage'),
  ('administrator', 'provider.engagements.manage'),
  ('administrator', 'provider.engagements.work'),
  ('fleet_manager', 'provider.jobs.browse'),
  ('fleet_manager', 'provider.proposals.manage'),
  ('fleet_manager', 'provider.engagements.manage'),
  ('fleet_manager', 'provider.engagements.work'),
  ('technician', 'provider.engagements.work')
on conflict do nothing;
-- END CAPABILITY SEED

create or replace function public.decide_provider_verification(
  p_organisation_id uuid,
  p_approve boolean,
  p_reason text default null,
  p_abn_active boolean default false,
  p_abn_name_matches boolean default false,
  p_insurance_document_id uuid default null,
  p_insurance_cover_cents bigint default null,
  p_qualification_document_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.provider_profiles%rowtype;
  o public.organisations%rowtype;
  d public.provider_documents%rowtype;
  q uuid;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if not app.has_platform_authority('verification_officer') then
    perform app.raise('forbidden', 'Only a Verification Officer decides verification');
  end if;
  select * into p from public.provider_profiles where organisation_id = p_organisation_id for update;
  select * into o from public.organisations where id = p_organisation_id;
  if p.organisation_id is null then perform app.raise('not_found', 'Provider not found'); end if;
  if p.status <> 'submitted' then perform app.raise('invalid_status', 'This provider is not waiting for review'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 and not p_approve then
    perform app.raise('reason_required', 'Give the reason for rejecting');
  end if;

  if p_approve then
    if not (p_abn_active and p_abn_name_matches) then
      perform app.raise('abn_not_confirmed', 'Confirm the ABN is active and matches the business name');
    end if;
    select * into d from public.provider_documents where id = p_insurance_document_id and organisation_id = p_organisation_id
      and kind = 'public_liability' and superseded_at is null;
    if d.id is null or d.expires_on is null or d.expires_on < v_today then
      perform app.raise('insurance_invalid', 'Choose a current public liability certificate');
    end if;
    -- Earlier badges are replaced by this decision.
    update public.provider_badges set revoked_at = now(), revoked_reason = 'Replaced by a new verification'
      where organisation_id = p_organisation_id and revoked_at is null;
    insert into public.provider_badges (organisation_id, kind, details, checked_by)
    values (p_organisation_id, 'abn', format('ABN %s checked: active and matches %s', o.abn, coalesce(o.legal_name, o.name)), auth.uid());
    insert into public.provider_badges (organisation_id, kind, document_id, details, cover_cents, checked_by, expires_on)
    values (p_organisation_id, 'public_liability', d.id,
            format('Public liability certificate checked%s, expires %s',
                   case when p_insurance_cover_cents is not null then ', cover $' || to_char(p_insurance_cover_cents / 100.0, 'FM999G999G999G990') else '' end,
                   to_char(d.expires_on, 'DD/MM/YYYY')),
            p_insurance_cover_cents, auth.uid(), d.expires_on);
    foreach q in array coalesce(p_qualification_document_ids, '{}') loop
      select * into d from public.provider_documents where id = q and organisation_id = p_organisation_id
        and kind in ('qualification', 'licence') and superseded_at is null;
      if d.id is null then perform app.raise('invalid_document', 'A qualification document was not found'); end if;
      insert into public.provider_badges (organisation_id, kind, category, document_id, details, checked_by, expires_on)
      values (p_organisation_id, 'qualification', d.category, d.id, format('%s checked', d.title), auth.uid(), d.expires_on);
    end loop;
  end if;

  update public.provider_profiles
  set status = case when p_approve then 'verified' else 'rejected' end,
      decided_at = now(), decided_by = auth.uid(), decision_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now()
  where organisation_id = p_organisation_id;
  perform app.audit(case when p_approve then 'verify' else 'reject' end, 'provider_profiles', null, p_organisation_id,
    jsonb_build_object('abn_active', p_abn_active, 'abn_name_matches', p_abn_name_matches, 'reason', p_reason,
                       'qualifications', coalesce(cardinality(p_qualification_document_ids), 0)));
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p_organisation_id, m.user_id, 'provider_verification',
         case when p_approve then 'Your business is verified' else 'Verification not approved' end,
         case when p_approve then 'You can now propose on marketplace jobs once billing is set up.' else 'Reason: ' || btrim(p_reason) end,
         'verification'
  from public.org_memberships m
  where m.organisation_id = p_organisation_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator');
end $$;

create or replace function app.notify_provider_document_expiry() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_n integer := 0;
begin
  for d in select * from public.provider_documents
           where superseded_at is null and expires_on is not null and expires_on >= v_today
             and ((expires_on <= v_today + 30 and warned_30_at is null) or (expires_on <= v_today + 7 and warned_7_at is null)) loop
    insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
    select d.organisation_id, m.user_id, 'provider_document_expiring',
           format('%s expires %s', d.title, to_char(d.expires_on, 'DD/MM/YYYY')),
           case when d.kind = 'public_liability' then 'Upload the renewed certificate: you can''t propose once insurance expires.' else 'Upload the renewed document.' end,
           'verification'
    from public.org_memberships m
    where m.organisation_id = d.organisation_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator');
    update public.provider_documents
    set warned_30_at = coalesce(warned_30_at, now()), warned_7_at = case when d.expires_on <= v_today + 7 then now() else warned_7_at end
    where id = d.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function app.alert_providers_of_job(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_n integer;
begin
  select * into j from public.marketplace_jobs where id = p_job;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select pp.organisation_id, m.user_id, 'marketplace_job',
         case when j.urgency = 'urgent' then 'URGENT job: ' else 'New job: ' end || j.title,
         format('%s · %s', j.suburb, (select r.name from public.marketplace_regions r where r.code = j.region_code)),
         'jobs/' || j.id
  from public.provider_profiles pp
  join public.org_memberships m on m.organisation_id = pp.organisation_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator')
  where app.provider_proposal_block(pp.organisation_id) is null
    and case when j.invited_only then exists (select 1 from public.marketplace_job_invites i where i.job_id = j.id and i.provider_id = pp.organisation_id)
             else j.category = any (pp.categories) and j.region_code = any (pp.region_codes)
                  and (j.urgency = 'standard' or pp.accepting_urgent)
                  and not ((now() at time zone 'Australia/Brisbane')::date = any (pp.unavailable_dates)) end;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.invite_providers(p_job_id uuid, p_provider_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_n integer;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  perform app.require_capability(j.organisation_id, 'marketplace.post');
  if j.status <> 'open' then perform app.raise('invalid_status', 'Only an open job takes invitations'); end if;
  insert into public.marketplace_job_invites (job_id, provider_id)
  select j.id, o.id from public.organisations o where o.id = any (p_provider_ids) and o.kind = 'provider'
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select o.id, m.user_id, 'marketplace_job', 'You''re invited to propose: ' || j.title, j.suburb, 'jobs/' || j.id
  from public.organisations o
  join public.org_memberships m on m.organisation_id = o.id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator')
  where o.id = any (p_provider_ids) and o.kind = 'provider';
  return v_n;
end $$;

create or replace function public.accept_marketplace_proposal(p_proposal_id uuid, p_follow_up_of uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pr public.marketplace_proposals%rowtype;
  v public.marketplace_proposal_versions%rowtype;
  j public.marketplace_jobs%rowtype;
  f public.marketplace_engagements%rowtype;
  v_block text;
  v_fee bigint;
  v_live boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'marketplace.connection_fees_live'), false);
  v_follow boolean := false;
  v_id uuid;
  v_provider_name text;
begin
  select * into pr from public.marketplace_proposals where id = p_proposal_id;
  if pr.id is null then perform app.raise('not_found', 'Proposal not found'); end if;
  -- Lock the job: two people accepting at once are handled one after the other.
  select * into j from public.marketplace_jobs where id = pr.job_id for update;
  perform app.require_capability(j.organisation_id, 'marketplace.accept');
  select * into pr from public.marketplace_proposals where id = p_proposal_id for update;
  if exists (select 1 from public.marketplace_engagements e where e.job_id = j.id and app.engagement_live(e.status)) then
    perform app.raise('already_engaged', 'This job already has an engagement');
  end if;
  if j.status <> 'open' then perform app.raise('job_closed', 'This job is not open'); end if;
  if pr.status <> 'active' or pr.valid_until <= now() then
    perform app.raise('proposal_unavailable', 'This proposal has expired or been withdrawn');
  end if;
  v_block := app.provider_proposal_block(pr.provider_id);
  if v_block is not null then perform app.raise('provider_not_eligible', 'This provider can''t take the job right now'); end if;
  if v_live then
    perform app.raise('fees_unavailable', 'Connection fee payments are not available yet');
  end if;
  select * into v from public.marketplace_proposal_versions where proposal_id = pr.id and version = pr.version;

  -- Follow-up with the same provider within 30 days: no connection fee for either party (SoW 4.7).
  if p_follow_up_of is not null then
    select * into f from public.marketplace_engagements where id = p_follow_up_of and organisation_id = j.organisation_id;
    if f.id is null or f.provider_id <> pr.provider_id or f.status not in ('confirmed_complete', 'completed_unconfirmed')
       or coalesce(f.completed_at, f.confirmed_at) < now() - make_interval(days => coalesce(app.setting_int('marketplace.follow_up_days'), 30)) then
      perform app.raise('not_a_follow_up', 'A follow-up must be with the same provider within 30 days of completion');
    end if;
    v_follow := true;
  end if;
  v_fee := case when v_follow then 0 else v.fee_cents end;

  insert into public.marketplace_engagements (job_id, organisation_id, provider_id, proposal_id, proposal_version_id,
    poster_fee_cents, provider_fee_cents, fee_status, follow_up_of)
  values (j.id, j.organisation_id, pr.provider_id, pr.id, v.id, v_fee, v_fee,
          case when v_follow then 'waived_follow_up' else 'not_live' end, p_follow_up_of)
  returning id into v_id;

  update public.marketplace_proposals set status = 'accepted', updated_at = now() where id = pr.id;
  update public.marketplace_proposals set status = 'not_selected', updated_at = now() where job_id = j.id and id <> pr.id and status = 'active';
  update public.marketplace_jobs set status = 'engaged' where id = j.id;
  select name into v_provider_name from public.organisations where id = pr.provider_id;
  if j.work_order_id is not null then
    update public.work_orders set vendor_name = v_provider_name, status = case when status = 'open' then 'in_progress' else status end,
      started_at = coalesce(started_at, now())
    where id = j.work_order_id;
  end if;

  perform app.notify_party(pr.provider_id, null, 'marketplace_engagement', 'Accepted: ' || j.title,
    'The customer accepted your proposal. Site details are now on the engagement.', 'engagements/' || v_id);
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p.provider_id, m.user_id, 'marketplace_proposal', 'Not selected: ' || j.title, 'The customer chose another proposal.', 'jobs/' || j.id
  from public.marketplace_proposals p
  join public.org_memberships m on m.organisation_id = p.provider_id and m.status = 'active' and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator')
  where p.job_id = j.id and p.status = 'not_selected' and p.id <> pr.id;
  return v_id;
exception when unique_violation then
  perform app.raise('already_engaged', 'This job already has an engagement');
end $$;

create or replace function public.send_marketplace_message(p_job_id uuid, p_provider_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  j public.marketplace_jobs%rowtype;
  v_from_provider boolean;
  v_engaged boolean;
  v_id uuid;
begin
  select * into j from public.marketplace_jobs where id = p_job_id;
  if j.id is null then perform app.raise('not_found', 'Job not found'); end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then perform app.raise('message_required', 'Write a message'); end if;
  v_engaged := exists (select 1 from public.marketplace_engagements e where e.job_id = j.id and e.provider_id = p_provider_id and app.engagement_live(e.status));
  if app.has_capability(p_provider_id, 'provider.jobs.browse') or (v_engaged and app.has_capability(p_provider_id, 'provider.engagements.work')) then
    v_from_provider := true;
    if not app.provider_can_see_job(p_provider_id, j) then perform app.raise('not_found', 'This job isn''t available'); end if;
    if j.status <> 'open' and not v_engaged then perform app.raise('invalid_status', 'This job is no longer open'); end if;
  elsif app.has_capability(j.organisation_id, 'marketplace.post') or app.has_capability(j.organisation_id, 'marketplace.accept') then
    v_from_provider := false;
    if not exists (select 1 from public.marketplace_messages m where m.job_id = j.id and m.provider_id = p_provider_id)
       and not exists (select 1 from public.marketplace_proposals p where p.job_id = j.id and p.provider_id = p_provider_id) then
      perform app.raise('not_found', 'No conversation with this provider');
    end if;
  else
    perform app.raise('forbidden', 'You can''t message on this job');
  end if;
  v_id := app.post_message(j.id, p_provider_id, v_from_provider, p_body);
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select case when v_from_provider then j.organisation_id else p_provider_id end, m.user_id, 'marketplace_message',
         case when v_from_provider then 'New message on ' else 'Reply on ' end || j.title,
         left((select body from public.marketplace_messages where id = v_id), 140),
         case when v_from_provider then 'marketplace/' || j.id else 'jobs/' || j.id end
  from public.org_memberships m
  where m.status = 'active'
    and ((v_from_provider and m.organisation_id = j.organisation_id and (m.user_id = j.posted_by or m.role in ('owner', 'account_owner')))
      or (not v_from_provider and m.organisation_id = p_provider_id and m.role in ('provider_owner', 'provider_manager', 'owner', 'administrator')));
  return v_id;
end $$;

create or replace function app.notify_party(p_org uuid, p_poster_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (organisation_id, recipient_id, kind, title, body, link_path)
  select p_org, m.user_id, p_kind, p_title, p_body, p_link
  from public.org_memberships m
  where m.organisation_id = p_org and m.status = 'active'
    and (m.user_id = p_poster_user or m.role in ('owner', 'administrator', 'account_owner', 'provider_owner', 'provider_manager'))
$$;

create or replace function public.save_provider_profile(p_organisation_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.organisation_kind;
  v_regions text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'region_codes', '[]')) x), '{}');
  v_cats text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) x), '{}');
begin
  perform app.require_capability(p_organisation_id, 'provider.profile.manage');
  select kind into v_kind from public.organisations where id = p_organisation_id;
  if v_kind not in ('provider', 'company') then
    perform app.raise('not_a_provider', 'Only provider and company accounts have a provider profile');
  end if;
  if not app.provider_categories_valid(v_cats) then
    perform app.raise('invalid_category', 'Choose service categories from the list');
  end if;
  if exists (select 1 from unnest(v_regions) r where not exists (select 1 from public.marketplace_regions m where m.code = r)) then
    perform app.raise('invalid_region', 'Choose regions from the list');
  end if;
  insert into public.provider_profiles as pp (organisation_id, description, contact_name, contact_phone, contact_email, categories, asset_class_codes,
    region_codes, base_suburb, base_postcode, radius_km, mobile_service, workshop_address, hours, accepting_urgent, unavailable_dates)
  values (
    p_organisation_id,
    nullif(btrim(coalesce(p ->> 'description', '')), ''),
    nullif(btrim(coalesce(p ->> 'contact_name', '')), ''),
    nullif(btrim(coalesce(p ->> 'contact_phone', '')), ''),
    nullif(lower(btrim(coalesce(p ->> 'contact_email', ''))), ''),
    v_cats,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'asset_class_codes', '[]')) x), '{}'),
    v_regions,
    nullif(btrim(coalesce(p ->> 'base_suburb', '')), ''),
    nullif(btrim(coalesce(p ->> 'base_postcode', '')), ''),
    nullif(p ->> 'radius_km', '')::integer,
    coalesce((p ->> 'mobile_service')::boolean, false),
    nullif(btrim(coalesce(p ->> 'workshop_address', '')), ''),
    nullif(btrim(coalesce(p ->> 'hours', '')), ''),
    coalesce((p ->> 'accepting_urgent')::boolean, false),
    coalesce((select array_agg(x::date) from jsonb_array_elements_text(coalesce(p -> 'unavailable_dates', '[]')) x), '{}')
  )
  on conflict (organisation_id) do update set
    description = excluded.description, contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
    contact_email = excluded.contact_email, categories = excluded.categories, asset_class_codes = excluded.asset_class_codes,
    region_codes = excluded.region_codes, base_suburb = excluded.base_suburb, base_postcode = excluded.base_postcode,
    radius_km = excluded.radius_km, mobile_service = excluded.mobile_service, workshop_address = excluded.workshop_address,
    hours = excluded.hours, accepting_urgent = excluded.accepting_urgent, unavailable_dates = excluded.unavailable_dates,
    updated_at = now();
end $$;

create or replace function app.provider_can_see_job(p_provider uuid, j public.marketplace_jobs) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  -- An organisation never sees its own jobs as a provider (it can't quote on them).
  return j.organisation_id <> p_provider and (not j.invited_only or exists (select 1 from public.marketplace_job_invites i where i.job_id = j.id and i.provider_id = p_provider))
     -- After it closes, only providers who took part (proposed or asked) keep access.
     and (j.status = 'open' and j.closes_at > now()
          or exists (select 1 from public.marketplace_proposals p where p.job_id = j.id and p.provider_id = p_provider)
          or exists (select 1 from public.marketplace_messages m where m.job_id = j.id and m.provider_id = p_provider));
end $$;

create or replace function public.search_marketplace_providers(p_organisation_id uuid, p_query text default null, p_category text default null, p_region text default null)
returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(lower(btrim(coalesce(p_query, ''))), '');
begin
  perform app.require_capability(p_organisation_id, 'marketplace.post');
  return query
  select jsonb_build_object('id', o.id, 'name', o.name, 'categories', pp.categories, 'mobile_service', pp.mobile_service,
    'accepting_urgent', pp.accepting_urgent, 'description', pp.description,
    'regions', (select coalesce(jsonb_agg(r.name order by r.sort_order), '[]') from public.marketplace_regions r where r.code = any (pp.region_codes)),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'details', b.details)), '[]')
               from public.provider_badges b where b.organisation_id = o.id and b.revoked_at is null))
  from public.provider_profiles pp
  join public.organisations o on o.id = pp.organisation_id
  where pp.status = 'verified' and o.id <> p_organisation_id
    and (v_q is null or lower(o.name || ' ' || coalesce(pp.description, '')) like '%' || v_q || '%')
    and (p_category is null or p_category = any (pp.categories))
    and (p_region is null or p_region = any (pp.region_codes))
  order by o.name
  limit 100;
end $$;
