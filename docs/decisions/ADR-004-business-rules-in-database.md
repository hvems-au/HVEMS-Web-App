# ADR-004 — Business rules live in Postgres; clients are thin

**Status:** Accepted (Omnific IT) · **Date:** 2026-11-09

## Decision
Safety-critical, financially significant and multi-row operations are implemented as **Postgres functions and triggers** (transactional, row-locked, idempotent where relevant) and exposed through the Supabase Data API as RPCs. Examples so far: `create_organisation`, `create_invitation`/`accept_invitation`, `assign_grant`, `record_meter_reading`, `archive_asset`, `import_assets`, `record_fleet_subscription_consent`, the asset consent guard and the condition engine. Third-party side effects (Stripe, email, push) will run in Edge Functions pinned to ap-southeast-2, driven by database events.

Next.js Server Actions only validate input (Zod), call `@hvems/api-client` with the user's session and map errors. **No essential business operation depends on a Next.js page action**, so the React Native app calls exactly the same API.

Errors carry a stable code (`app.raise(code, message)` → PostgREST `hint`), which `@hvems/api-client` turns into `AppError(code)`. Clients map codes to copy; they never parse messages.

## Consequences
- Rules are tested once, in pgTAP, at the layer that enforces them.
- Offline mobile sync submits the same RPCs with `client_request_id` for idempotency (see mobile-readiness notes).
