-- Covering indexes for the tenancy composite foreign keys of the pre-start tables (advisor 0001).
create index inspections_asset_org_idx on public.inspections (asset_id, organisation_id);
create index inspection_answers_inspection_org_idx on public.inspection_answers (inspection_id, organisation_id);
create index inspection_photos_inspection_org_idx on public.inspection_photos (inspection_id, organisation_id);
create index defects_asset_org_idx on public.defects (asset_id, organisation_id);
create index defects_inspection_org_idx on public.defects (inspection_id, organisation_id);
