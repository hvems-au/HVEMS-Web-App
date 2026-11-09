# ADR-006 — Collecting two connection fees "together" with Stripe

**Status:** Proposed — **deviation requires HVEMS approval** · **Date:** 2026-11-09 · **Scope:** CS-29, CS-36–CS-39 (increment 2D)

## Context
SoW §4.5 and §5.4: on acceptance, HVEMS collects the poster's and the provider's connection fees together. If either payment fails, neither party is charged; if the provider's payment fails, the job shows "Acceptance pending fees" for 4 hours (standard) or 30 minutes (urgent). Two simultaneous acceptances must create one engagement and charge once. Stripe can't charge two independent cards atomically.

## Decision
HVEMS charges both parties as **its own customers** (no Stripe Connect; HVEMS never moves job payments). Cards are saved with SetupIntents.

1. **Reserve (database, one transaction):** `accept_proposal(proposal_id, idempotency_key)` locks the job row, refuses if an acceptance or engagement already exists (unique partial index on active acceptance per job), checks both parties' eligibility, **reserves a company waiver** if one is available (row-locked, so it can't be used twice), and creates an `acceptance_attempt` (state `authorising`) with deterministic Stripe idempotency keys.
2. **Authorise (Edge Function, ap-southeast-2):** create both PaymentIntents with `capture_method=manual`, `off_session=true`, `confirm=true` (skip the poster's when the waiver covers it). An authorisation reserves the amount but **charges nothing**.
3. **Outcomes**

| Situation | Action | Result for the parties |
|---|---|---|
| Both authorised | Capture both, then confirm the engagement in one DB transaction; release private details; other proposals "Not selected" | Both charged once |
| Poster authorisation fails | Cancel the provider authorisation; release the waiver; attempt `failed_poster` | Nothing charged; poster asked to update the card; proposal stays open |
| Provider authorisation fails | Keep the poster authorisation (and waiver) held; attempt `pending_provider_fees`; notify provider; window 4 h / 30 min (setting) | "Acceptance pending fees" |
| Provider fixes card within window | Authorise provider, capture both, confirm | Both charged once |
| Window lapses, or poster cancels the pending acceptance | Cancel the poster authorisation; release the waiver | Nothing charged |
| A capture fails after the other succeeded (rare: authorisation already succeeded) | Refund the captured fee automatically; cancel the other; release the waiver; open a reconciliation item | Net nothing charged; a charge and its refund may both appear |
| Retry or duplicate click | Same idempotency keys → same PaymentIntents; unique constraints → one engagement | Never charged twice |

4. **Webhooks** (`payment_intent.*`, `charge.refunded`, `setup_intent.succeeded`) are verified, stored by event id (idempotent) and reconciled against `acceptance_attempts` and an **internal ledger** (integer cents, AUD). A scheduled job sweeps expired authorisations and lapsed windows.

## Deviation to approve
"If either payment fails, neither party is charged" holds: nothing is **captured** unless both succeed. But:
- a successful **authorisation** can briefly appear as a pending hold on the poster's statement while the provider has time to fix their card (up to 4 hours, or until the bank releases it);
- in the rare case where a capture fails after the other succeeded, the successful party sees a charge followed by an automatic refund.

No technically available design avoids both. HVEMS should approve this wording for the terms (A-02).

## Consequences
- Authorisations expire after about 7 days for online card payments; the pending window (≤ 4 h) is well within that.
- Waiver reservation, release and restoration are database transitions with tests for "can't be used twice".
