# HVEMS — working notes for Claude sessions

HVEMS (Heavy Vehicle & Equipment Management System) is a commercial SaaS built by **Omnific IT** for HVEMS (owner: Jaimie, Moreton Bay QLD). This repository holds the Stage 2 web platform, the Supabase backend, and shared packages for the Stage 3 React Native/Expo app.

## Sources of truth (in order)
1. **HVEMS Client Scope of Work v2.2** (27 Oct 2026). It prevails over everything else. Requirement ids are CS-01–CS-45; decisions D-01–D-08 are Confirmed; open approvals are A-01–A-08. Summary and status: `docs/requirements/traceability.md`.
2. Companion *Development Scope and Functional Specification v2.2*: **not yet received**. Don't invent requirements; add any interpretation to `docs/requirements/interpretations.md`.
3. Figma "HVEMS Web App (Copy)", file key `7avSLLNRbCjh8iZxKKJYbM`: visual direction only. Conflicts with the SoW are listed in `docs/design/figma-analysis.md` (F-01–F-12).
4. Architecture and decisions: `docs/architecture/architecture-review.md`, `docs/decisions/ADR-*.md`.

## Non-negotiable rules
- **The database enforces everything.** RLS on every table; safety, money and multi-row rules are Postgres functions/triggers (ADR-004). Server Actions are thin: validate (Zod) → `@hvems/api-client` → map errors. Never put a business rule only in the UI.
- **Asset condition is derived, never set** (ADR-005). Nothing may clear a safety cause because work, a job or an inspection completed.
- **Tenancy:** every tenant row has `organisation_id`; child tables use composite FKs `(x_id, organisation_id)`; policies use `(select app.orgs_with_capability('…'))`. The URL org id is a selector only.
- **Append-only:** `audit_events`, `security_events`, `asset_condition_history`, `asset_count_events`.
- **Money** is integer AUD cents; the business calendar is Australia/Brisbane; display dd/mm/yyyy.
- **Capability changes** go in BOTH the identity migration seed (a new migration once applied) AND `packages/permissions/src/matrix.ts`; the drift test enforces it.
- **Settings over code:** values the SoW lets HVEMS change live in `platform_settings`.
- **Scope exclusions (SoW §11.3):** no escrow, dispatch, SMS/WhatsApp, GPS tracking, telematics, accounting/payroll, custom roles, SSO, public API, provider directory, map displays, cross-org asset sharing.
- **No mock data** to disguise unfinished features; unbuilt modules use `ModulePlaceholder`.
- **Secrets:** never commit `.env*` (except `.env.example`); never use the Supabase secret key in the browser.
- Don't apply migrations to the hosted project or make security-, money- or irreversible changes without Ahmad's approval.

## Layout
```
apps/web            Next.js 16 (App Router, proxy.ts, Tailwind 4); read node_modules/next/dist/docs before using Next APIs
packages/domain     pure business rules + tests (pricing, waivers, calendar, safety, meters, ABN, CSV)
packages/permissions roles/grants/capabilities (mirror of DB seed)
packages/validation Zod schemas
packages/types      record types
packages/api-client typed Supabase calls + AppError mapping
packages/ui         design tokens (Figma)
supabase/migrations SQL migrations (timestamped)
supabase/tests      pgTAP tests (run with `pnpm db:test`)
scripts/db          local Supabase shim for tests
docs/               architecture, ADRs, requirements, design, mobile readiness, progress log
```

## Commands
- `pnpm install` · `pnpm dev` (web on :3000; admin console on `admin.localhost:3000`)
- `pnpm test` (Vitest) · `pnpm db:test` (fresh local PG16 + all migrations + pgTAP) · `pnpm typecheck` · `pnpm lint` · `pnpm build`
- `pnpm check` runs everything.

## Supabase
- Project `anvqykllajezwaasguqp`, region ap-southeast-2, Postgres 17, **Free plan** (see ADR-002 / AP-9).
- Schema changes: add a new timestamped file in `supabase/migrations/`; never edit a migration that has been applied to the hosted project. After applying through the connector, rename the local file to the version the project assigned (`list_migrations`) so histories match.
- After each migration: run the security and performance advisors, then regenerate `packages/types/src/database.generated.ts` (`schema-compat.ts` catches enum drift).
- Errors: `app.raise('<code>', '<message>')` → PostgREST `hint` → `AppError.code`.

## Current status
See `docs/progress-log.md` (latest entry first) and `docs/roadmap.md`. Increment 2A is complete and its migrations are applied to the hosted project (AP-1 done; hosting AP-2 approved; backups AP-3 owned by Ahmad). Next: Auth dashboard settings, E2E tests, then increment 2B Safety.
