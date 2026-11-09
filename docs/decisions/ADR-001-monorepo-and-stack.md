# ADR-001 — Monorepo and technology stack

**Status:** Accepted (Omnific IT) · **Date:** 2026-11-09

## Decision
- `pnpm` workspaces monorepo: `apps/web` (Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Radix/shadcn-style components, React Hook Form + Zod, TanStack Query/Table), shared `packages/*`, `supabase/` (migrations, pgTAP tests), `docs/`.
- Shared packages are TypeScript source with no build step, so both Next.js (`transpilePackages`) and the future Expo app (Metro) can consume them:
  - `@hvems/domain`: pure business rules (pricing, waivers, QLD calendar, condition, severity, meters, ABN, PIN, CSV)
  - `@hvems/permissions`: roles, grants, capabilities (mirror of the DB seed)
  - `@hvems/validation`: Zod schemas for every form/API input
  - `@hvems/types`: record types returned by the Data API
  - `@hvems/api-client`: typed calls over `SupabaseClient` (tables + RPCs) and error mapping
  - `@hvems/ui`: platform-neutral design tokens from Figma
  - `@hvems/config`: environment validation
- Versions pinned to current stable releases at the time of writing (Next 16.4, React 19.3, TypeScript 6.0, Tailwind 4.3, supabase-js 2.119, @supabase/ssr 0.12). TypeScript 7 (native) is not used yet because the Next.js toolchain still targets the JS compiler API.

## Consequences
- One repository for the web app, backend schema and shared mobile code; no separate API service (avoids unnecessary microservices).
- Turborepo is not needed yet; add it when build times justify caching.
