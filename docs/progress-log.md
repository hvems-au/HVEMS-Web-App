# Development progress log

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
