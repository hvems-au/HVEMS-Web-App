# HVEMS — Stage 1 architecture review and Stage 2A status

**Prepared by:** Omnific IT (with Claude) · **Date:** 9 November 2026 · **Status:** for review and approval — AP-1 done, AP-2 approved, AP-3 owned by Ahmad, AP-5 resolved (updated 9 Nov 2026)
**Inputs:** HVEMS Client Scope of Work v2.2 (27 Oct 2026, read in full); Figma "HVEMS Web App (Copy)" (117 frames inspected); Supabase project `anvqykllajezwaasguqp`; HVEMS logo PDF.
**Not available:** *HVEMS Development Scope and Functional Specification v2.2* (the companion spec). Where the SoW is silent, this build uses the SoW's own wording and records every interpretation in [`../requirements/interpretations.md`](../requirements/interpretations.md); it does not invent requirements.

---

## 1. What has been verified

| Item | Finding | How verified |
|---|---|---|
| Scope of Work | v2.2 read in full: 13 sections, appendices A–B, CS-01–CS-45, D-01–D-08 confirmed, A-01–A-08 open approvals | Document |
| Figma | Accessible. One page, 117 frames: company (47), technician (17), driver (6), job poster (12), provider (18), super admin (15), other (2). Tokens extracted. 12 conflicts with the SoW and ~40 missing screens identified | Figma MCP: metadata, variables, design context, screenshots |
| Supabase project | "HVEMS APP", **ap-southeast-2 (Sydney)**, Postgres **17**, healthy, created 9 Nov 2026. Was **empty** before 2A (nothing existing to preserve); now holds the 2A schema | Supabase MCP (`get_project`, `list_tables`, `list_migrations`) |
| Supabase plan | Organisation "HVEMS" is on the **Free plan**: no daily backups, no point-in-time recovery, projects pause when idle | Supabase MCP (`get_organization`) |
| Admin privileges | The Supabase MCP connection can apply migrations. After approval AP-1, four migrations were applied on 9 Nov 2026 (§4) | Supabase MCP (`list_migrations`) |
| Supabase backups | Daily backups: 7 days (Pro), 14 (Team), up to 30 (Enterprise). PITR add-on: 7/14/28 days (~US$100/200/400 per month). Backups are stored in the project's region | Supabase docs |
| Edge Functions | Run nearest the caller by default; can be pinned to `ap-southeast-2` per invocation (regional invocation) | Supabase docs |
| GitHub | Repository `ahmadkhattakOD/HVEMS-Web-App` (private) created; full history pushed | GitHub integration |

## 2. Architecture in one page

```
                    ┌──────────── Vercel (syd1) ─────────────┐
 Browser ───────────▶  Next.js 16 App Router (apps/web)       │
  (Customer, Provider │   proxy.ts: session refresh, admin-host │
   portals; admin     │   isolation; Server Components +        │
   console on its     │   Server Actions = thin orchestration   │
   own host)          └──────────────┬──────────────────────────┘
                                     │ user JWT (publishable key)
 React Native app (Stage 3) ─────────┤  same API contract (@hvems/api-client)
                                     ▼
            ┌──────────── Supabase · ap-southeast-2 ────────────┐
            │ Auth (one identity per person, TOTP MFA)          │
            │ PostgREST Data API ── RLS on every table          │
            │ Postgres RPC functions: atomic business rules     │
            │   (condition engine, consent guard, import, …)    │
            │ Storage (private buckets, signed URLs) — 2C       │
            │ Edge Functions pinned to ap-southeast-2 — 2D:     │
            │   Stripe webhooks, ABR lookup, email, scheduled   │
            │ pg_cron / queues for background jobs — 2B+        │
            └───────────────────────────────────────────────────┘
```

**Principles**
1. **The database is the enforcement point.** Every table has RLS; every business rule that protects safety, money or tenancy is a Postgres function or trigger. The web app and the future mobile app are clients of the same API, so no rule needs rebuilding for mobile ([ADR-004](../decisions/ADR-004-business-rules-in-database.md)).
2. **One identity, many contexts.** One Supabase Auth user; memberships in organisations of kind `company`, `marketplace_customer` or `provider`. Roles are valid only for their kind, so a company membership can never carry provider access ([ADR-003](../decisions/ADR-003-tenancy-and-permissions.md)).
3. **The URL selects, the database decides.** `/customer/{orgId}/…` only chooses a context; capabilities come from `my_capabilities()`, and RLS checks the *row's* organisation. Editing the org id grants nothing (pgTAP-tested).
4. **Condition is derived, never set** ([ADR-005](../decisions/ADR-005-asset-condition-engine.md)).
5. **Append-only evidence.** Audit history, security events, condition history and asset-count history refuse UPDATE and DELETE even from the database owner.
6. **Settings, not code,** for every value the SoW lets HVEMS change: `platform_settings`, labelled Confirmed / Recommended.

**Monorepo** (`pnpm` workspaces): `apps/web`; `packages/{domain, permissions, validation, types, api-client, ui, config}` shared with React Native; `supabase/{migrations, tests}`; `docs/`.

## 3. What is built (Stage 2A foundations)

| Area | Delivered | Evidence |
|---|---|---|
| Accounts | Sign-up, email verification, login, password reset, sign-out, TOTP MFA enrolment and challenge, onboarding for all three account types, organisation/portal switcher | `apps/web/app/(auth)`, `account/security`, `onboarding`, `select-context` |
| Roles and grants | 12 roles, 3 grants, 49 capabilities exactly per SoW §2.4; grant eligibility (drivers can't hold authority; technicians no marketplace); competency note for Clearance Authority; MFA rule §2.5; free-tier 5-login limit | `20261109072440_identity.sql`; `packages/permissions` |
| Invitations | Hashed one-time tokens, email-bound acceptance, expiry, revocation | identity migration; Team page |
| Staff and support access | Staff need aal2 for everything; time-limited, logged support access visible to the customer Owner; admin console only on `ADMIN_HOST` | identity migration; `proxy.ts`; `app/admin` |
| Equipment register | All SoW §3.1 fields; class-driven mandatory fields; duplicate asset number refused; duplicate VIN/serial/rego needs a reason; client/site links can't cross tenants (composite FKs) | `20261109072703_fleet.sql`; Equipment pages |
| Sixth-asset consent | Database refuses a 6th current asset until Owner/Finance consents to the price with a saved payment method; serialised per company | fleet migration (`assets_before_write`) |
| Archiving | Reason, effective date, disposal; open issues must be acknowledged for sale; history kept; stops counting | `archive_asset()` |
| Meter readings | Never overwrite; lower → reason + manager acceptance; implausible jump → confirmation; out-of-sequence flagged; amendments; idempotent `client_request_id` | `record_meter_reading()` etc. |
| CSV import | 1,000-row limit, trial run reporting every row's errors, all-or-nothing import, consent check | `import_assets()`; import wizard |
| Condition engine | Causes → condition per §3.4; clearing a Critical opens "awaiting return to service"; history; API roles cannot open/resolve causes | fleet migration |
| Clients and sites | Private per company; site timezone, shift times, access and safety instructions | Clients & Sites page |
| Audit history | Automatic on every 2A table, with actor and identification method; secrets redacted; Owner/Admin viewer | foundation migration; Audit page |
| Portals | Customer (company + marketplace-only), Provider and Admin shells, Figma design language, responsive to 360 px | `apps/web` |

Later-increment modules appear in navigation as muted items with an honest "delivered in increment 2B/2C/2D" page — no mock data.

## 4. Test results (this session)

| Suite | Result |
|---|---|
| pgTAP database tests (local Postgres 16 with a Supabase-compatible auth shim) | **130 / 130 pass** — tenant isolation, spoofed org id, portal separation, anon denial, role/grant rules, MFA, invitations, member limit, support access, audit immutability, register rules, condition engine, meter rules, consent guard, archiving, import |
| Vitest unit tests | **110 / 110 pass**: SoW pricing tables, §5.2 billing example, all four §5.6 worked examples, GST table, waivers, founding-provider waiver, condition and clearance rules, ABN, PIN, MFA, QLD calendar, CSV, environment validation; plus drift tests proving TS mirrors equal the SQL seeds |
| TypeScript strict | Pass (8 workspaces) |
| ESLint (Next 16 core-web-vitals + TS) | 0 errors; 1 known warning (TanStack Table vs React Compiler) |
| `next build` | Pass (33 routes + proxy) |
| HTTP checks on the built app | Protected routes redirect to login; `/admin` 404 off the admin host; admin host redirects elsewhere to `/admin`; security headers present |
| Visual check | Login (desktop and 360–390 px) and app shell compared with Figma; screenshots in `docs/design/` |
| **Hosted project (PG 17)** | Migrations `foundation`, `identity`, `fleet`, `fk_indexes` applied 2026-11-09. Smoke test of 24 checks run inside one transaction and rolled back (no data left): sign-up → profile, create company, asset with class rules, meter reading + lower-reading rule, sixth-asset consent guard, count history, audit rows; a second user sees nothing and can't write; anon refused; API role can't set condition or open causes; critical → cleared → awaiting return to service → active; audit delete refused. **24/24 as expected** |
| Supabase advisors | Security: only the intended `SECURITY DEFINER` RPCs (each checks capability inside) plus Supabase's own `rls_auto_enable` event-trigger function. Performance: tenancy FK indexes added (`fk_indexes`); remaining "unindexed FK" items are user-reference columns, accepted (see `docs/database/schema.md`); "unused index" items are expected on an empty database |

**Not yet tested end to end:** the web app in a browser against the hosted project. This session's network blocks `*.supabase.co`; the Playwright suite runs in CI or from a machine that can reach Supabase.

## 5. Decisions and approvals needed

| # | Decision | Why it matters | Recommendation |
|---|---|---|---|
| **AP-1** | **Apply the 2A migrations to project `anvqykllajezwaasguqp`** | Nothing works end to end until the schema exists. | ✅ **Approved and done 2026-11-09** — applied, advisors run, smoke-tested, types generated (§4) |
| **AP-2** | **Hosting: Supabase + Vercel instead of the SoW's AWS Sydney (A-05)** | SoW §12.1 targets AWS Sydney. Supabase runs on AWS ap-southeast-2, but it is a different contract and subprocessor set, and it changes the running-cost estimate | ✅ **Approved 2026-11-09** (communicated by Ahmad): Supabase ap-southeast-2 + Vercel `syd1`. ADR-002 accepted |
| **AP-3** | **Backups: 35 days in Australia, ≤1 h data loss (SoW §12.1)** | The Free plan has no backups. Supabase's maximum is 28-day PITR (30 days daily on Enterprise); Storage files are not in database backups | **Owned by Ahmad (Omnific IT)** from 2026-11-09 — the backup arrangement is managed outside this workstream. The §12.1 targets remain acceptance criteria |
| **AP-4** | **Two connection fees "together or not at all" (SoW §4.5, §5.4)** | Stripe can't make one atomic charge across two cards | Authorise both with manual capture and capture only when both succeed; release or refund otherwise. Disclosed deviation: a temporary card *authorisation hold* may briefly appear, and in a rare capture failure a refund follows a charge. See ADR-006 |
| **AP-5** | **Figma conflicts F-01–F-12** | Several Figma screens contradict confirmed scope (custom roles, maps, company approval gate, provider job posting, in-app helpdesk, stock in Stage 2) | ✅ **Resolved 9 Nov 2026** (approved by Ahmad): build follows the SoW for all twelve. F-04 no company approval gate; F-06 providers post jobs through a customer account under the same login; F-08 no in-app tickets, link to HVEMS's helpdesk (product still to be named). Figma designs not yet updated |
| **AP-6** | **Interpretations I-01–I-13** | The companion spec is missing; a few permission details are implicit in the SoW | ✅ **Resolved 9 Nov 2026** by the Development Specification v2.2: 8 confirmed; I-02, I-03, I-04, I-09, I-10 corrected (see `dev-spec-reconciliation.md`) |
| **AP-7** | **Accounts in HVEMS's name (SoW §9.4, §12.8)** | Stripe, email sending domain, error monitoring, Vercel, GitHub org; production must be HVEMS-owned | Create before increment 2D (Stripe, email) and before staging |
| **AP-8** | **Stage 1 acceptance** | SoW §9.1: Stage 2 starts after HVEMS accepts Stage 1. 2A work has started at Omnific's direction | Treat this review + Figma updates as the Stage 1 acceptance package |
| **AP-9** | **Supabase plan** | Free projects pause when idle and have no backups | Upgrade to Pro before staging; add PITR before the pilot |

### Genuine technical blockers right now
0. **Auth settings need a dashboard change** (the connector can't set them): Site URL, redirect URLs for `/auth/callback`, leaked-password protection, TOTP MFA, custom SMTP once HVEMS's sending domain exists.
1. Supabase is unreachable from this development session's network (HTTP 403 from the egress proxy). Schema work goes through the Supabase connector; browser end-to-end tests need the project reachable (allow `*.supabase.co` in claude.ai capabilities, or run the Playwright suite in CI).
2. Email delivery (invitations, alerts) needs HVEMS's sending domain and provider account. Until then, invitations show a one-time link to share.

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Companion functional spec unavailable | Rework if it differs from interpretations | Interpretations register; obtain spec before 2B |
| PITR maximum 28 days vs 35-day target | Acceptance target unmet | AP-3 — backup arrangement owned by Ahmad |
| Edge Functions default to global execution | Data processed outside AU | Always invoke with `region: ap-southeast-2`; Next.js server on Vercel `syd1` |
| Sub-processors outside AU (Stripe, monitoring, email) | Privacy review | Minimise data sent; choose AU-capable providers; list in privacy policy (A-02) |
| Email is not instant (SoW §6.3) | Missed critical alerts | In-app acknowledgement and escalation; push in Stage 3; UI wording |
| Performance at 20,000 assets / 500,000 records | Slow lists | Initplan RLS pattern (capability arrays computed once per query), composite indexes, trigram search; load test before 2B acceptance |
| Supabase Free plan | Project pauses; no backups | AP-9 |

## 7. Next development tasks (in order)

1. ~~Apply migrations, advisors, remote checks, generated types~~ (done 2026-11-09). Configure Auth in the dashboard (Site URL, redirect URLs → `/auth/callback`, password policy, TOTP on, leaked-password protection).
2. Playwright end-to-end suite against the hosted project (sign-up → onboarding → equipment → import → team → audit).
3. Increment **2B Safety**: driver profiles and PIN, equipment codes/QR, public code page, inspection templates and versions, pre-start, defects/triage/holds/deferral, two-step clearance, breakdowns, critical alerts and escalation (pg_cron).
4. Increments 2C and 2D per [`../roadmap.md`](../roadmap.md).
