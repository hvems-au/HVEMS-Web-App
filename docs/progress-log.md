# Development progress log

## 2026-11-09 — Session 1
**Done**
- Read the Client Scope of Work v2.2 in full; Figma analysed (117 frames); Supabase project inspected (Sydney, PG 17, empty, Free plan).
- Monorepo scaffolded; shared packages (domain, permissions, validation, types, api-client, ui, config).
- Migrations: foundation (settings, audit, security events), identity (orgs, memberships, roles/grants/capabilities, invitations, staff, support access, payment-method stub, MFA rule, RPCs), fleet (classes, clients, sites, assets, count history, consent, operator permissions, condition engine, meter readings, archive, import).
- Web app: auth flows, MFA, onboarding, context switcher, Customer/Provider/Admin shells, dashboard, equipment list/detail/create/edit/archive/import, meter readings, clients & sites, team & grants, settings, audit history.
- Tests: pgTAP 130/130, Vitest 107/107, typecheck, lint (0 errors), production build; visual check against Figma.

**Blocked / waiting**
- AP-1 approval to apply migrations to the hosted project.
- GitHub repository access for this session.
- Network access to `*.supabase.co` from the dev environment for browser E2E (or run E2E in CI).

**Next**
- Apply migrations → remote pgTAP → advisors → generated types → Auth configuration → Playwright E2E → start 2B.
