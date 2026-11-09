# Development progress log

## 2026-11-10 — Session 2 (continued): custom asset classes; either meter unit
**Done**
- Company asset classes (O-03): "+ Add a new class…" in the equipment form for Owner, Company Admin and Fleet Manager; the class is saved for the company and offered again. Super Admin → Asset Classes lists the standard classes and adds new ones for everyone. The database keeps each company's classes private and stops an asset using another company's class.
- Either meter unit (O-04): the meter form offers odometer and hours; a manager can tick "also track…" and the asset switches to both (audited).
- Migration `20261110090000_asset_classes_and_meters`, applied by Ahmad through the SQL editor and verified; types regenerated; the capability drift test now reads every migration. Browser-tested: class created and reused, equipment saved, odometer recorded on an hours machine.

## 2026-11-09 — Session 2 (continued): edit clients/sites; Super Admin organisation management
**Done**
- Edit clients and sites (company portal, `clients.manage` / `sites.manage`); cleared fields are stored as empty; client notes not on the form are left alone. Browser-tested.
- Super Admin: `/admin/organisations/[id]` to edit name, legal name, ABN and timezone, and to de-activate (suspend) or reinstate with a reason (ADM-02, ACC-18). Support Agents can view only (B.5). Banners in the company and provider portals while suspended.
- Migration `platform_organisation_admin` + pgTAP `030`: RPCs `admin_update_organisation`, `admin_set_organisation_suspended` (Platform Administrator + MFA), suspension blocks new equipment, invitations and members; safety functions continue. Dry-run on the hosted project inside a rolled-back transaction: all checks as expected.

- Migration applied by Ahmad through the SQL editor (recorded as `20261109160000 platform_organisation_admin`); verified columns, functions, privileges and triggers; types regenerated; advisors show no new findings.

**Waiting on**
- A Super Admin browser test of the edit and de-activate screens (needs an MFA sign-in).

## 2026-11-09 — Session 2 (continued): five portals
**Done**
- ADR-009: Super Admin console, company portal (with marketplace inside), marketplace (marketplace-only customers), provider portal and driver sign-in, each on its own host with its own session.
- Signed, single-use 60-second portal handoff (`/auth/handoff`), logged in `security_events`; per-portal login, sign-up, onboarding and email links.
- Sign-in now does a full-page navigation after success: the in-action redirect rendered the target before the new session cookie was visible, which showed the login page again.
- Placeholders on the login, sign-up, forgot-password and reset-password fields. Super Admin naming; ABN Lookup dropped (O-01).
- Checked in the browser (Edge): separate sessions per host; handoff works once, and a reused or tampered token is refused; a company org gives 404 on the marketplace host; signing out of one portal keeps the others signed in. Vitest 121/121.

**Waiting on**
- Supabase Auth redirect allow-list entries need a trailing `**` (`http://company.localhost:3000/auth/callback**` etc.); production hosts once the domain is live.
- Production domain names for the five hosts.

## 2026-11-09 — Session 2: console, brand, development specification
**Done**
- Local run documented: `corepack pnpm install`; start with `corepack pnpm --filter @hvems/web dev` (the root scripts call `pnpm` recursively, which fails when pnpm is only available through corepack).
- Test accounts on the hosted project: Platform Administrator `ahmad.khattak@omnificit.com.au`; company "Omnific Developers" owned by `ahmad.khattak@omnificdevelopers.com`. Change the temporary passwords before any real use.
- Admin host: "Administrator Login" title and subtitle; no sign-up option; `/sign-up` redirects to `/login` (`lib/admin-host.ts` shared with `proxy.ts`).
- Console Audit History (`/admin/audit`): every organisation plus platform-level events, filters by organisation and record. RLS checked by simulation: staff with MFA see everything, staff without MFA see nothing, company owner sees only their own company.
- Brand Identity Guidelines v1.0 applied: Montserrat, Charcoal `#444444`, Orange `#CE5502`, type scale utilities (`docs/design/brand.md`).
- Development Specification v2.2 received and reconciled (`docs/requirements/dev-spec-reconciliation.md`); AP-6 resolved.

**Waiting on**
- Approval to implement the spec corrections (reconciliation §3 items 2–8, 10–12) on the hosted project.
- Decision on per-portal sessions and handoff (§3 item 1, D-06) and on the MFA recovery-code approach (item 9).

## 2026-11-09 — Session 1 (continued): hosted database
**Approvals received (Ahmad):** AP-1 apply migrations ✅ · AP-2 hosting (Supabase ap-southeast-2 + Vercel `syd1`) ✅ · AP-3 backups — owned by Ahmad, outside this workstream.

**Done**
- Applied `foundation`, `identity`, `fleet` to project `anvqykllajezwaasguqp`; renamed local migration files to the hosted versions.
- Ran security and performance advisors; added `fk_indexes` migration (tenancy FK indexes) and recorded the accepted findings in `docs/database/schema.md`.
- Hosted smoke test (PG 17), rolled back: 24/24 checks as expected; verified nothing persisted.
- Generated `packages/types/src/database.generated.ts`; added a compile-time drift check (`schema-compat.ts`) between generated enums and the shared types.
- pgTAP 130/130 and Vitest 107/107 re-run with the renamed migrations; typecheck clean.

**AP-5 resolved (Ahmad):** build follows the SoW for F-01–F-12. F-04 no company approval gate; F-06 providers use a customer account under the same login (pointer added to the provider dashboard); F-08 no in-app tickets — the support link now comes from `NEXT_PUBLIC_SUPPORT_URL` and is hidden until HVEMS names its helpdesk (the hard-coded, unverified address was removed).

**Waiting on**
- Auth dashboard settings (Site URL, redirect URLs, leaked-password protection, TOTP).
- AP-4 (connection-fee hold-then-charge design and terms wording) — explained, not yet approved.
- Name of HVEMS's helpdesk product / contact form URL (F-08).

**Next**
- Playwright E2E against the hosted project (CI) → increment 2B Safety.

## 2026-11-09 — Session 1
**Done**
- Repository `ahmadkhattakOD/HVEMS-Web-App` created and pushed (5 commits).
- Read the Client Scope of Work v2.2 in full; Figma analysed (117 frames); Supabase project inspected (Sydney, PG 17, empty, Free plan).
- Monorepo scaffolded; shared packages (domain, permissions, validation, types, api-client, ui, config).
- Migrations: foundation (settings, audit, security events), identity (orgs, memberships, roles/grants/capabilities, invitations, staff, support access, payment-method stub, MFA rule, RPCs), fleet (classes, clients, sites, assets, count history, consent, operator permissions, condition engine, meter readings, archive, import).
- Web app: auth flows, MFA, onboarding, context switcher, Customer/Provider/Admin shells, dashboard, equipment list/detail/create/edit/archive/import, meter readings, clients & sites, team & grants, settings, audit history.
- Tests: pgTAP 130/130, Vitest 107/107, typecheck, lint (0 errors), production build; visual check against Figma.

**Blocked / waiting**
- AP-1 approval to apply migrations to the hosted project.
- Network access to `*.supabase.co` from the dev environment for browser E2E (or run E2E in CI).

**Next**
- Apply migrations → remote pgTAP → advisors → generated types → Auth configuration → Playwright E2E → start 2B.
