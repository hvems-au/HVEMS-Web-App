# Test report — Session 1 (increment 2A)

**Date:** 9 Nov 2026 · **Commit:** see git history

| Suite | Command | Result |
|---|---|---|
| pgTAP database tests | `pnpm db:test` | 130 / 130 pass (2 files) |
| Unit tests (Vitest) | `pnpm test` | 107 / 107 pass (5 files) |
| TypeScript strict | `pnpm typecheck` | Pass, 8 workspaces |
| ESLint | `pnpm lint` | 0 errors, 1 warning (TanStack Table / React Compiler compatibility, expected) |
| Production build | `pnpm build` | Pass: 33 routes + proxy |
| HTTP behaviour | `next start` + curl | Protected routes → login; `/admin` 404 on the customer host; admin host confined to `/admin`; HSTS, X-Frame-Options DENY, Referrer-Policy present; no `X-Powered-By` |
| Visual | headless Chrome screenshots | Login (desktop, 390 px) matches Figma; app shell and equipment table checked with fixture data on a temporary route (since deleted) |

## Brief "critical tests" coverage

| # | Test | Where | Status |
|---|---|---|---|
| 1 | One company cannot access another's private data | pgTAP 010 (orgs, assets, clients, memberships, audit, profiles) | ✅ |
| 2 | Company and provider roles remain separate | pgTAP 010 (role/kind trigger both ways; provider can't read or create assets) | ✅ |
| 3 | Changing the active organisation id grants nothing | pgTAP 010 (insert/update into other org refused; cross-tenant FK refused; invite into other org refused) | ✅ |
| 4 | Defects generate the correct asset conditions | pgTAP 020 + Vitest (engine level; defect workflow UI in 2B) | ✅ engine |
| 5 | A Critical defect can't be bypassed | pgTAP 020 (condition column not writable; causes not openable or resolvable by API roles; clearing doesn't return to service) | ✅ engine |
| 6 | Closing work doesn't clear safety defects | Enforced by design (ADR-005); test arrives with work orders in 2C | ⏳ |
| 7 | Only authorised people clear Critical defects | Capability/grant tests (pgTAP 010, Vitest); clearance RPC in 2B | 🟡 |
| 8 | Billing calculations follow the scope | Vitest: §5.2 table and example, §5.6 examples 1–4, GST table | ✅ |
| 9 | Waivers can't be used twice | 2D (row-locked reservation) | ⏳ |
| 10 | Payment retries can't create duplicate charges | 2D (Stripe idempotency keys + unique constraints); meter idempotency proven in pgTAP | ⏳ |
| 11 | Simultaneous acceptances can't create two engagements | 2D | ⏳ |
| 12 | Providers can't see protected information before confirmation | 2D | ⏳ |
| 13 | Audit history remains intact | pgTAP 010 (UPDATE/DELETE refused even as owner; redaction) | ✅ |
| 14 | Reports reflect actual records | 2C | ⏳ |
| 15 | Web workflows function end to end | Playwright against the hosted project (schema now applied) | ⏳ |

## Known gaps
- The full pgTAP suite runs on Postgres **16** locally. On the hosted Postgres **17** project, a 24-check smoke test (tenancy, anon denial, register rules, meter rules, consent guard, condition engine, audit immutability) ran inside one transaction and was rolled back: **24/24 as expected** (2026-11-09). pgTAP is not installed on the hosted project; run `supabase test db --linked` from CI if full remote runs are wanted.
- No browser end-to-end tests yet. The dev environment can't reach `*.supabase.co`; CI or an allow-listed session will run them.
- Concurrency (two sessions inserting the sixth asset at once) relies on `SELECT … FOR UPDATE` on the organisation row; a multi-session pgTAP test is planned.
