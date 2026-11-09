# Database — Stage 2A schema

Postgres 17 (Supabase, ap-southeast-2). Migrations in `supabase/migrations`, applied in filename order. Every `public` table has RLS enabled; API roles get explicit grants only (column-level for writes).

## Schemas
| Schema | Purpose | Exposed via Data API |
|---|---|---|
| `public` | Tables and RPCs | Yes |
| `app` | Helper functions, capability seed tables, trigger functions | No |
| `extensions` | pgcrypto, citext, pg_trgm | No |
| `auth` | Supabase Auth (managed) | No |

## Tables
| Table | Purpose | Key rules |
|---|---|---|
| `platform_settings` | HVEMS-controlled values with SoW status label | Readable by signed-in users; changes audited |
| `audit_events` | Append-only audit history | UPDATE/DELETE/TRUNCATE blocked by trigger, even for the owner; readable with `audit.view` |
| `security_events` | Role changes, grants, support access, lockouts | Append-only |
| `profiles` | 1:1 with `auth.users` | Created by trigger on sign-up; visible to self and co-members |
| `organisations` | `company` / `marketplace_customer` / `provider` | Providers need a valid ABN; settings JSON holds company safety rules |
| `org_memberships` | Person ↔ organisation with one role | Role must be valid for the kind; unique per org/person |
| `membership_grants` | Clearance Authority / Approval Limit / Marketplace Buyer | Eligibility by role; competency note or amount required; one active per type |
| `invitations` | Email invitations | SHA-256 token hash only; 7-day expiry; one pending per email/org |
| `platform_staff` | HVEMS staff role + authorities | All staff access requires an aal2 session |
| `support_access_grants` | Time-limited support access | Reason ≥ 10 chars; capped duration; visible to customer Owner |
| `payment_methods` | Saved Stripe payment methods (written by webhook in 2D) | Drives the MFA and consent rules |
| `asset_classes` | 11 classes in 2 categories | `required_fields` drives mandatory fields |
| `clients`, `sites` | Company clients and sites | Unique names per org; site timezone, shifts, access and safety instructions |
| `assets` | Equipment register | Unique asset number per org; duplicate VIN/serial/rego needs a reason; composite FKs to client/site/membership; system columns not client-writable |
| `asset_count_events` | +1/−1 history for billing | Immutable; drives highest-count billing and waiver qualification |
| `fleet_subscription_consents` | Owner/Finance consent with price shown | Required before a sixth current asset |
| `asset_operator_permissions` | Permitted drivers per asset or site | Drivers see only permitted assets |
| `asset_condition_causes` | Open/resolved reasons for condition | Written only by SECURITY DEFINER safety workflows |
| `asset_condition_history` | Condition changes with cause | Immutable |
| `meter_readings` | Odometer and engine-hour readings | Never overwritten; statuses accepted / pending / rejected / superseded; idempotent `client_request_id` |

## RPCs (callable by signed-in users)
`create_organisation`, `my_contexts`, `my_capabilities`, `my_staff_context`, `create_invitation`, `revoke_invitation`, `accept_invitation`, `update_member_role`, `remove_member`, `assign_grant`, `revoke_grant`, `start_support_access`, `end_support_access`, `record_meter_reading`, `decide_meter_reading`, `amend_meter_reading`, `record_fleet_subscription_consent`, `archive_asset`, `import_assets`.

All are `SECURITY DEFINER` with `search_path = ''`, check `auth.uid()` and capabilities explicitly, and raise coded errors via `app.raise`. EXECUTE is revoked from `anon` and `public`.

## Key helper functions (`app`)
`orgs_with_capability(cap)`, `has_capability(org, cap)`, `member_orgs()`, `orgs_with_support_access()`, `is_platform_staff(roles)`, `mfa_required(org)`, `require_capability`, `require_mfa_if_needed`, `derive_condition(asset)`, `recompute_asset_condition`, `open_condition_cause` / `resolve_condition_cause` (not executable by API roles), `can_return_to_service`, `asset_validation_errors`, `is_valid_abn`, `audit`, `audit_row_change`.

## Performance notes
- Policies use `(select app.orgs_with_capability(...))::uuid[]`, evaluated once per statement (initplan), not per row.
- Indexes: `(organisation_id, archived_at, condition)`, case-insensitive asset number, VIN/serial/rego lookups, trigram search across identifiers, meter history by asset/unit/time, audit by org/time and entity.
