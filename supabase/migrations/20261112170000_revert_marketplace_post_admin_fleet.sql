-- Reverts 20261112164549. Company Admins, Fleet Managers and Finance post marketplace
-- jobs through the Marketplace Buyer grant (SoW §2.4, I-07), given per person by the Owner.
delete from app.role_capabilities
where capability = 'marketplace.post' and role in ('administrator', 'fleet_manager');
