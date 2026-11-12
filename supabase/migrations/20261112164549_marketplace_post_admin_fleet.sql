-- Applied by mistake on 12 Nov 2026 and reverted by 20261112170000: SoW §2.4 (I-07)
-- gives job posting through the per-person Marketplace Buyer grant, not by role.
-- Kept so the migration history matches the hosted project. Deliberately outside
-- the capability seed markers (matrix.ts does not include these pairs).
insert into app.role_capabilities (role, capability) values
  ('administrator', 'marketplace.post'),
  ('fleet_manager', 'marketplace.post')
on conflict do nothing;
