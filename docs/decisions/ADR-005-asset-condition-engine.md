# ADR-005 — Asset condition engine

**Status:** Accepted (implements Confirmed decisions #5, #6 and D-07) · **Date:** 2026-11-09 · **Scope:** CS-13–CS-16

## Decision
- `assets.condition` is **derived** from open rows in `asset_condition_causes` by `app.derive_condition()`: any open `critical_defect`, `unverified_unsafe_report`, `critical_finding_awaiting_review`, `out_of_service_hold` or `awaiting_return_to_service` → **Broken/Out of service**; otherwise any open `minor_defect`, `needs_attention_hold` (or `overdue_service` when the company rule is on) → **Needs attention**; else **Active**. Advisory defects open no cause.
- A trigger recomputes the condition on every cause change, inside the same transaction, and writes immutable `asset_condition_history` with the cause.
- No API role can write `condition` (column privileges) or open/resolve causes (functions revoked). Only SECURITY DEFINER safety workflows (2B: defects, holds, clearance, breakdowns, unverified reports, provider findings) can.
- Clearing a Critical defect (or an unverified unsafe report, a provider's Critical finding or an Out of service hold) **opens `awaiting_return_to_service` before resolving the original**, so the asset never passes through Active. Return-to-service is available only when no other Out of service cause is open (`app.can_return_to_service`).
- Closing a work order, confirming a marketplace job, reading a handwritten form or a passing inspection never resolves a cause; none of those workflows will be granted the resolve function.

## Consequences
- The rule "a later passing inspection never clears a Critical defect" holds by construction, online and after offline sync.
- `@hvems/domain/safety` mirrors the derivation for client display and offline preview; the database stays authoritative.
