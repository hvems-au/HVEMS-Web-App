# Test report

## Current: 24 Nov 2026 (increments 2A–2D, web)

| Suite | Command | Result |
|---|---|---|
| pgTAP database tests | `pnpm db:test` (CI, Postgres 16) | all pass (43 files, `supabase/tests/010`–`430`; 794 checks before 430 was added) |
| Unit tests (Vitest) | `pnpm test` | 146 / 146 pass (12 files) |
| Browser end to end (Playwright) | `E2E_PASSWORD=… corepack pnpm --filter @hvems/web e2e` against a running app | 49 pass, 1 skipped (`portal@` is a Fleet Manager in dev, so the Company Admin menu check skips; set `E2E_COMPANY_ADMIN_EMAIL`) |
| TypeScript strict / ESLint / build | `pnpm typecheck` · `pnpm lint` · `pnpm build` (CI) | Pass; 1 expected lint warning (TanStack Table) |

### What the end-to-end suite covers (`apps/web/e2e`)
- **Sign-in** through the real form for five roles (setup project, sessions reused): Company Admin, Fleet Manager, Technician, Finance, Provider Owner.
- **Access by role** (`access.spec.ts`): each role's menu shows and hides the right items; a Technician opening `/costs` directly is refused, not just hidden.
- **Page smoke** (`pages.spec.ts`): 23 company pages and 6 provider pages open without the error screen.
- **Accessibility** (`pages.spec.ts`): axe WCAG 2.2 AA scan, no critical issues, on dashboard, equipment, defects, work orders, marketplace, find work and reports.
- **Phone width** (`@phone`, Pixel 7): the dashboard has no sideways scrolling.
- **Marketplace privacy** (`marketplace.spec.ts`): a provider sees a sample job's suburb but never its street address before an engagement; a company never sees its own jobs under Find work; proposals have their own filtered page.

The suite only reads. It skips itself when `E2E_PASSWORD` isn't set, so CI without a running app is unaffected. Sessions are saved to `apps/web/e2e/.auth/` (git-ignored).

### Brief "critical tests": current status

| # | Test | Where | Status |
|---|---|---|---|
| 1 | One company cannot access another's private data | pgTAP 010, 020, 250–420 (every module adds isolation checks) | ✅ |
| 2 | Company and provider roles remain separate | pgTAP 010, 190, 410 (company acting as provider uses its own capabilities, never another org's data) | ✅ |
| 3 | Changing the active organisation id grants nothing | pgTAP 010 | ✅ |
| 4 | Defects generate the correct asset conditions | pgTAP 020, 080, 120 + Vitest | ✅ |
| 5 | A Critical defect can't be bypassed | pgTAP 020, 080 | ✅ |
| 6 | Closing work doesn't clear safety defects | pgTAP 430 (completing and closing a work order raised for a Critical defect leaves the defect open and the equipment out of service), 390 (same for an engagement) | ✅ |
| 7 | Only authorised people clear Critical defects | pgTAP 080 (a technician without Clearance Authority is refused) | ✅ |
| 8 | Billing calculations follow the scope | Vitest (§5.2, §5.6 examples, GST) | ✅ engine; charging waits on Stripe |
| 9 | Waivers can't be used twice | Waits on billing (Stripe) | ⏳ |
| 10 | Payment retries can't create duplicate charges | Waits on billing (Stripe) | ⏳ |
| 11 | Simultaneous acceptances can't create two engagements | pgTAP 390 (unique index, concurrent accepts) | ✅ |
| 12 | Providers can't see protected information before confirmation | pgTAP 380/390 + E2E `marketplace.spec.ts` | ✅ |
| 13 | Audit history remains intact | pgTAP 010, 170 | ✅ |
| 14 | Reports reflect actual records | Reports are built from the same RLS-scoped queries as the screens; pgTAP 360 covers export logging; E2E opens the report pages | 🟡 no figure-by-figure check yet |
| 15 | Web workflows function end to end | Playwright (above): read-only journeys | 🟡 write journeys (post, propose, accept) still manual, see the tester handover |

### Acceptance tests T-01–T-47 (dev spec Appendix E)
The appendix text isn't held in this repository, so a per-test map isn't kept here yet. When it is added, map each T-number to the pgTAP file or E2E spec above. Known links: T-01 isolation → pgTAP 010 and every module's isolation checks; T-12 condition matrix → pgTAP 020/080/120; T-24 provider verification (ABN by hand, O-01) → pgTAP 370.

---

## Session 1 (increment 2A)

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
