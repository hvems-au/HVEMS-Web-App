-- =============================================================================
-- More sample marketplace jobs for the DEVELOPMENT database only. Run in the
-- Supabase SQL editor after the 2D migrations (through 20261122150000).
-- Refuses to run unless MFA enforcement is off (true only in development) and
-- does nothing if the sample jobs are already there.
--
-- Adds 12 open jobs across every service category, six regions, urgent and
-- standard, with and without budgets, one invitation-only. Posted by:
--  * "Test Customer (Marketplace)" when it exists (from seed-marketplace-test-data.sql),
--    otherwise "Omnific Developers";
--  * "Omnific Developers" for jobs on its own equipment (each gets a marketplace
--    work order, as when posting from the company portal).
-- Most have no proposals, so testers can quote as HVEMS Test Provider or as a
-- company working as a provider. Every description ends "(Sample job)".
-- =============================================================================
do $seed$
declare
  v_co uuid := (select id from public.organisations where name = 'Omnific Developers' and kind = 'company' limit 1);
  v_cust uuid := (select id from public.organisations where name = 'Test Customer (Marketplace)' limit 1);
  v_owner uuid := (select id from auth.users where email = 'ahmad.khattak@omnificdevelopers.com');
  v_cust_user uuid := (select id from auth.users where email = 'customer@hvems.com.au');
  v_prov_user uuid := (select id from auth.users where email = 'provider@hvems.com.au');
  v_prov uuid;
  v_poster uuid;
  v_poster_user uuid;
  v_assets uuid[];
  v_asset uuid;
  v_wo uuid;
  v_num integer;
  v_job uuid;
  p uuid;
  i integer := 0;
  r record;
begin
  if coalesce((select value #>> '{}' from public.platform_settings where key = 'security.mfa_enforced'), 'true') <> 'false' then
    raise exception 'Sample data is for the development database only (MFA enforcement is on here).';
  end if;
  if v_co is null or v_owner is null then
    raise exception 'Expected development accounts not found (Omnific Developers and its Owner).';
  end if;
  if exists (select 1 from public.marketplace_jobs where description like '%(Sample job)') then
    raise notice 'Sample jobs already present; nothing done.';
    return;
  end if;
  select o.id into v_prov from public.organisations o join public.org_memberships m on m.organisation_id = o.id
  where m.user_id = v_prov_user and o.kind = 'provider' limit 1;

  -- Customer-side poster: the test customer if it exists, else the company.
  if v_cust is not null and v_cust_user is not null then
    v_poster := v_cust; v_poster_user := v_cust_user;
  else
    v_poster := v_co; v_poster_user := v_owner;
  end if;
  select array_agg(id order by created_at) into v_assets from public.assets where organisation_id = v_co and archived_at is null;

  -- Jobs from the customer (equipment described on the job).
  for r in
    select * from (values
      ('Truck losing power on hills', 'Prime mover loses power under load on the Bruce Highway climbs. Black smoke when pulling. Booked for runs from Monday.',
       'diesel_mechanical', 'breakdown_repair', 'standard', 'sunshine_coast', 'Caloundra', '4551', '{"class": "Prime mover", "make": "Volvo", "model": "FH16", "registration": "SAM101"}'::jsonb, 60000, 250000, false),
      ('Reversing camera and lights not working', 'Reversing camera screen blank and two rear marker lights out on the tipper. Probably a wiring loom fault at the rear.',
       'auto_electrical', 'breakdown_repair', 'standard', 'brisbane', 'Geebung', '4034', '{"class": "Tipper truck", "make": "Hino", "model": "700", "registration": "SAM102"}'::jsonb, null, 90000, false),
      ('URGENT: excavator track came off on site', 'Left track has come off the idler on a 20-tonne excavator. Machine is on a slope, crew waiting. Need someone today.',
       'mobile_plant', 'breakdown_repair', 'urgent', 'logan', 'Yatala', '4207', '{"class": "Excavator", "make": "CAT", "model": "320", "description": "20-tonne excavator on a building site"}'::jsonb, null, null, false),
      ('Cracked bucket teeth adaptor to weld', 'Adaptor on a 1.2 m bucket has a crack along the weld. Bucket can be dropped at your workshop or worked on site.',
       'welding_fabrication', 'planned_service', 'standard', 'ipswich', 'Bundamba', '4304', '{"class": "Excavator bucket", "description": "1.2 m general purpose bucket"}'::jsonb, 40000, 120000, false),
      ('Fridge van not holding temperature', 'Refrigerated body only gets to 8 degrees instead of 2. Compressor cycles on and off. Carries food; needs fixing this week.',
       'refrigeration', 'breakdown_repair', 'standard', 'brisbane', 'Rocklea', '4106', '{"class": "Refrigerated truck", "make": "Isuzu", "model": "NPR", "registration": "SAM105"}'::jsonb, null, null, false),
      ('Heavy vehicle inspection before sale', 'Independent pre-sale inspection report for a 2018 tipper: brakes, steering, suspension, chassis and body. Written report needed.',
       'inspections', 'inspection', 'standard', 'redland', 'Capalaba', '4157', '{"class": "Tipper truck", "make": "Kenworth", "model": "T409", "registration": "SAM106"}'::jsonb, 30000, 60000, false),
      ('URGENT: tow a broken-down tipper', 'Tipper has stopped on the side of the road and won''t restart. Needs towing to our yard at Morayfield, 18 km.',
       'towing_recovery', 'breakdown_repair', 'urgent', 'moreton_bay', 'Burpengary East', '4505', '{"class": "Tipper truck", "make": "Isuzu", "model": "FVZ", "registration": "SAM107"}'::jsonb, null, null, false),
      ('Two steer tyres for the water cart', 'Front steer tyres are cupping. Supply and fit two 295/80R22.5 steer tyres and check the alignment.',
       'tyres', 'planned_service', 'standard', 'moreton_bay', 'Kallangur', '4503', '{"class": "Water cart", "make": "Mitsubishi", "model": "Fuso Fighter", "registration": "SAM108"}'::jsonb, 90000, 160000, false),
      ('Invited: hydraulic pump rebuild quote', 'Main hydraulic pump on the loader needs a rebuild. Invited providers only: pump can be removed and sent to your workshop.',
       'hydraulics', 'other', 'standard', 'moreton_bay', 'Narangba', '4504', '{"class": "Wheel loader", "make": "Komatsu", "model": "WA200"}'::jsonb, null, 400000, true)
    ) as t(title, description, category, job_type, urgency, region_code, suburb, postcode, shared_asset, budget_min, budget_max, invited_only)
  loop
    i := i + 1;
    insert into public.marketplace_jobs (organisation_id, title, description, category, job_type, urgency, shared_asset, region_code, suburb, postcode,
      address, site_access_notes, budget_min_cents, budget_max_cents, invited_only, posted_by, posted_at, closes_at, preferred_from)
    values (v_poster, r.title, r.description || ' (Sample job)', r.category, r.job_type, r.urgency, r.shared_asset, r.region_code, r.suburb, r.postcode,
      i || ' Sample Street, ' || r.suburb || ' QLD ' || r.postcode,
      case when r.urgency = 'urgent' then 'Call the site supervisor on arrival. Hi-vis required.' else 'Sign in at the office. Hi-vis and steel caps.' end,
      r.budget_min, r.budget_max, r.invited_only, v_poster_user,
      now() - make_interval(hours => case when r.urgency = 'urgent' then 1 else 4 * i end),
      case when r.urgency = 'urgent' then now() + interval '22 hours' else now() + make_interval(days => 14 - (i % 5)) end,
      case when r.urgency = 'urgent' then null else current_date + 1 + (i % 6) end)
    returning id into v_job;
    -- The invitation-only job invites HVEMS Test Provider.
    if r.invited_only and v_prov is not null then
      insert into public.marketplace_job_invites (job_id, provider_id, invited_by) values (v_job, v_prov, v_poster_user) on conflict do nothing;
    end if;
  end loop;

  -- Jobs from Omnific Developers on its own equipment, each with a marketplace work order.
  for r in
    select * from (values
      ('Air-conditioning not cooling in the cab', 'Cab air-conditioning blows warm. Re-gas and leak test needed. Operator works in full sun.', 'refrigeration', 'breakdown_repair', 'standard', 'moreton_bay', 'North Lakes', '4509', null::bigint, 70000::bigint),
      ('Hour-meter service on the backhoe', 'Due for its 1,000-hour service: oils, filters, grease and an inspection report. Machine is at our yard.', 'diesel_mechanical', 'planned_service', 'standard', 'moreton_bay', 'North Lakes', '4509', 80000::bigint, 140000::bigint),
      ('URGENT: hydraulic hose burst on the loader', 'Lift ram hose has burst. Machine parked and oil contained. Needed back in service today.', 'hydraulics', 'breakdown_repair', 'urgent', 'moreton_bay', 'North Lakes', '4509', null::bigint, null::bigint)
    ) as t(title, description, category, job_type, urgency, region_code, suburb, postcode, budget_min, budget_max)
  loop
    i := i + 1;
    v_asset := case when coalesce(cardinality(v_assets), 0) > 0 then v_assets[1 + (i % cardinality(v_assets))] end;
    v_wo := null;
    if v_asset is not null then
      select coalesce(max(number), 0) + 1 into v_num from public.work_orders where organisation_id = v_co;
      insert into public.work_orders (organisation_id, number, asset_id, title, description, kind, priority, created_by)
      values (v_co, v_num, v_asset, r.title, r.description, 'marketplace', case when r.urgency = 'urgent' then 'urgent' else 'normal' end, v_owner)
      returning id into v_wo;
    end if;
    insert into public.marketplace_jobs (organisation_id, work_order_id, asset_id, title, description, category, job_type, urgency, shared_asset,
      region_code, suburb, postcode, address, site_access_notes, budget_min_cents, budget_max_cents, posted_by, posted_at, closes_at, preferred_from)
    select v_co, v_wo, v_asset, r.title, r.description || ' (Sample job)', r.category, r.job_type, r.urgency,
      coalesce((select jsonb_strip_nulls(jsonb_build_object('make', a.make, 'model', a.model)) from public.assets a where a.id = v_asset), '{"description": "Company equipment"}'::jsonb),
      r.region_code, r.suburb, r.postcode, '1 Test Avenue, North Lakes QLD 4509', 'Report to the workshop office. Hi-vis and steel caps.',
      r.budget_min, r.budget_max, v_owner, now() - make_interval(hours => 2 * i),
      case when r.urgency = 'urgent' then now() + interval '20 hours' else now() + interval '13 days' end,
      case when r.urgency = 'urgent' then null else current_date + 2 end
    returning id into v_job;
    -- One proposal from HVEMS Test Provider on the backhoe service, so the company has something to compare.
    if r.title like 'Hour-meter service%' and v_prov is not null and v_prov_user is not null then
      insert into public.marketplace_proposals (job_id, provider_id, valid_until, submitted_at) values (v_job, v_prov, now() + interval '3 days', now() - interval '1 hour')
      returning id into p;
      insert into public.marketplace_proposal_versions (proposal_id, version, price_basis, amount_cents, gst_applies, available_from, available_to, valid_until,
        inclusions, fee_cents, fee_consented_at, created_by)
      values (p, 1, 'fixed', 112000, true, current_date + 2, current_date + 4, now() + interval '3 days', 'All oils and filters, grease, inspection report.', 2900,
              now() - interval '1 hour', v_prov_user);
    end if;
  end loop;

  raise notice 'Added % sample marketplace jobs (posted by % and Omnific Developers).', i,
    case when v_poster = v_co then 'Omnific Developers' else 'Test Customer (Marketplace)' end;
end
$seed$;
