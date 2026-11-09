-- HVEMS 2A — covering indexes for tenancy foreign keys (performance advisor 0001)
--
-- Added after the first hosted advisor run. Indexes are added where a lookup by
-- the referencing columns is a real access path (RLS joins, permission checks,
-- cascades). Accepted without an index, and recorded in docs/database/schema.md:
--   * user-reference columns (created_by, opened_by, decided_by, recorded_by, …):
--     only scanned if an auth user is hard-deleted, which HVEMS does not do
--     (people are deactivated; records are retained per SoW §10);
--   * meter_readings and asset_condition_history (asset_id, organisation_id):
--     already served by indexes that lead with asset_id;
--   * assets.asset_class_id: asset classes are deactivated, never deleted.

-- Replace single-column indexes with composite ones that also cover the FK.
drop index if exists public.assets_site_idx;
drop index if exists public.assets_client_idx;
drop index if exists public.sites_client_idx;
create index assets_site_org_idx on public.assets (site_id, organisation_id) where site_id is not null;
create index assets_client_org_idx on public.assets (client_id, organisation_id) where client_id is not null;
create index assets_responsible_org_idx on public.assets (responsible_membership_id, organisation_id)
  where responsible_membership_id is not null;
create index sites_client_org_idx on public.sites (client_id, organisation_id) where client_id is not null;

create index membership_grants_membership_org_idx on public.membership_grants (membership_id, organisation_id);
create index support_access_grants_org_idx on public.support_access_grants (organisation_id);

create index asset_count_events_asset_idx on public.asset_count_events (asset_id);
create index condition_causes_asset_org_idx on public.asset_condition_causes (asset_id, organisation_id);
create index meter_readings_amends_idx on public.meter_readings (amends_reading_id) where amends_reading_id is not null;
create index fleet_consents_payment_method_idx on public.fleet_subscription_consents (payment_method_id)
  where payment_method_id is not null;

create index operator_perms_org_idx on public.asset_operator_permissions (organisation_id);
create index operator_perms_membership_org_idx on public.asset_operator_permissions (membership_id, organisation_id);
create index operator_perms_asset_org_idx on public.asset_operator_permissions (asset_id, organisation_id) where asset_id is not null;
create index operator_perms_site_org_idx on public.asset_operator_permissions (site_id, organisation_id) where site_id is not null;
