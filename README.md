# HVEMS — Heavy Vehicle & Equipment Management System

Stage 2 web platform for HVEMS, built by Omnific IT. It has three experiences on one Supabase backend:

- **Customer Portal**: company organisations (fleet, safety, maintenance) and marketplace-only customers
- **Provider Portal**: independent technicians, mobile mechanics and workshops
- **HVEMS administration console**: on its own address; MFA always required

The future Android and iOS apps (React Native + Expo) will use the same database, auth, permissions and `packages/*`.

## Quick start

```bash
nvm use               # Node 22
pnpm install
cp .env.example apps/web/.env.local   # public Supabase URL + publishable key are prefilled
pnpm dev              # http://localhost:3000  (console: http://admin.localhost:3000/admin)
```

## Quality checks

```bash
pnpm test       # unit tests (Vitest): pricing, waivers, safety rules, permissions, calendar, CSV
pnpm db:test    # all migrations + pgTAP tests on a throwaway local Postgres 16 (needs postgresql-16 + pgtap)
pnpm typecheck  # TypeScript strict, all workspaces
pnpm lint       # ESLint (Next.js core-web-vitals + TypeScript)
pnpm build      # production build
```

## Applying the database

Migrations live in `supabase/migrations`. They are applied to the hosted project only after approval (see `docs/architecture/architecture-review.md`, AP-1), using the Supabase CLI (`supabase link --project-ref anvqykllajezwaasguqp && supabase db push`) or the Supabase MCP connector. Afterwards:

```bash
supabase test db --linked     # same pgTAP suite against the hosted project
pnpm db:types                 # regenerate packages/types/src/database.generated.ts
```

Auth settings to configure in the dashboard: site URL and redirect URLs (`/auth/callback`), TOTP MFA enabled, leaked-password protection, email templates, SMTP (HVEMS sending domain).

## Documentation

| | |
|---|---|
| Architecture review and approvals | [`docs/architecture/architecture-review.md`](docs/architecture/architecture-review.md) |
| Decisions | [`docs/decisions/`](docs/decisions) |
| Requirements traceability (CS-01–CS-45) | [`docs/requirements/traceability.md`](docs/requirements/traceability.md) |
| Interpretations to confirm | [`docs/requirements/interpretations.md`](docs/requirements/interpretations.md) |
| Figma analysis, conflicts, missing screens | [`docs/design/figma-analysis.md`](docs/design/figma-analysis.md) |
| Database | [`docs/database/schema.md`](docs/database/schema.md) |
| Testing | [`docs/testing/test-report.md`](docs/testing/test-report.md) |
| Mobile readiness | [`docs/mobile-readiness/README.md`](docs/mobile-readiness/README.md) |
| Roadmap and progress | [`docs/roadmap.md`](docs/roadmap.md), [`docs/progress-log.md`](docs/progress-log.md) |

© HVEMS. Bespoke code is owned by HVEMS on payment of the related milestones, subject to the MoU (SoW §12.8).
