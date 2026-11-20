-- =============================================================================
-- Decision (Ahmad, 20/11/2026): Company Admins post marketplace jobs and accept
-- proposals by default, like the Owner. SoW 4.2 limits this to the Owner and
-- Marketplace Buyers, so HVEMS acknowledges the change through change control
-- (docs/requirements/dev-spec-reconciliation.md). Other roles still need the grant.
-- =============================================================================

-- BEGIN CAPABILITY SEED (matrix.ts mirror; the drift test reads every migration)
insert into app.role_capabilities (role, capability) values
  ('administrator', 'marketplace.post'),
  ('administrator', 'marketplace.accept')
on conflict do nothing;
-- END CAPABILITY SEED
