# ADR-003 — Tenancy, roles and permissions

**Status:** Accepted (Omnific IT) · **Date:** 2026-11-09 · **Scope:** CS-01–CS-06, CS-25

## Decision
- **One identity per person** (Supabase Auth). `profiles` is 1:1 with `auth.users`.
- **Organisations of three kinds** in one table: `company`, `marketplace_customer`, `provider`. A person's role in an organisation is a membership (`org_memberships`, one role each). A trigger refuses roles that aren't valid for the kind, so a company membership can never be a provider role and vice versa (SoW §2.5).
- **Grants** (`membership_grants`): Clearance Authority (needs a competency note), Approval Limit (needs an amount), Marketplace Buyer. Eligibility is enforced: drivers can't hold any; technicians can't hold Marketplace Buyer; Owners have Clearance Authority and marketplace authority by role.
- **Capabilities** are seeded in `app.role_capabilities` / `app.grant_capabilities` and mirrored in `@hvems/permissions`, with a unit test that fails on drift.
- **RLS everywhere.** Policies compare the row's `organisation_id` to arrays computed once per statement (`(select app.orgs_with_capability('assets.view'))`), the Supabase-recommended initplan pattern for performance at 20,000+ rows.
- **Column-level privileges** stop clients writing system-managed columns (condition, archive fields, current meter values, organisation).
- **Composite foreign keys** `(id, organisation_id)` make cross-tenant links impossible (e.g. an asset can't reference another company's client).
- **No server-side "active organisation".** The URL or the mobile app's selector chooses a context for display; permission is always evaluated against the row's organisation. Changing the organisation id grants nothing (pgTAP test).
- **HVEMS staff** are rows in `platform_staff`; every staff policy also requires an `aal2` (MFA) session. Staff read customer data only through `support_access_grants`: time-limited (setting, default 240 min), reason-required, logged as a security event and visible to the customer's Owner.
- **MFA rule (SoW §2.5)** is a database function (`app.mfa_required`) enforced in privileged RPCs; the web layout redirects to enrolment when required.

## Consequences
- The same rules protect the web app, the mobile app and any future integration.
- Custom roles are excluded (SoW §11.3); adding a role is a migration plus a matrix update.
