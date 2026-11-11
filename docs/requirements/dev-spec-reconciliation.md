# Development Specification v2.2: reconciliation with the build

**Source:** *HVEMS Development Scope and Functional Specification v2.2* (Omnific IT, 27 Oct 2026, "for review"), received 9 Nov 2026. The PDF isn't kept in the repository.

**How it applies here**
- The Client Scope of Work v2.2 still prevails (spec §1.2).
- **BR** items (business rules) bind the build. Changing one needs HVEMS approval.
- **IR** items (implementation recommendations) are Omnific IT's to change "through the architecture record" (spec, *How to use*). The spec's technology choices are IR and predate ADR-001/002. Where they differ from the approved stack, the ADRs win. §1 lists those differences.
- **TBC** items wait on SoW approvals A-01–A-08.

Requirement IDs below (ACC-, AST-, BIL-, ADM-, AUD-, NFR-, CFG-, T-) are the spec's own.

## 1. Technology: spec (IR) vs approved stack

| Spec §2.1 / §17 (IR) | Built / approved | Basis | Gap to close |
|---|---|---|---|
| Three Next.js apps on `customer.` / `provider.` / `admin.` subdomains | One Next.js app; console on its own host; customer and provider portals on path prefixes | ADR-001, ADR-007 | See §3 item 1 (sessions per audience) |
| Node.js REST `/v1` with OpenAPI | Supabase PostgREST + RPC functions behind `@hvems/api-client`; rules in Postgres | ADR-004 | Publish an API description of the RPC surface for handover (§19.3) |
| AWS RDS Multi-AZ + PostGIS | Supabase Postgres 17 (AWS ap-southeast-2) | ADR-002, AP-2 approved | Enable PostGIS when regions/distance are built (2D) |
| Redis + BullMQ workers | `pg_cron` + notification outbox + Edge Functions | ADR-004 | Build in 2B (escalations NOT-03 at 30 min / 2 h) |
| S3 with malware scanning | Supabase Storage (private buckets, signed URLs) | ADR-002 | **Malware scanning not yet chosen** (DOC-02, needed 2C) |
| ECS Fargate, CloudFront, WAF, Terraform | Vercel `syd1` + Supabase | AP-2 approved | WAF/rate-limit equivalent to document (NFR-06) |
| Own auth library, Argon2id, 10 recovery codes | Supabase Auth (bcrypt), TOTP | ADR-001 | **No MFA recovery codes in Supabase** (ACC-03), see §3 |
| Amazon SES | Email provider on HVEMS's domain, not yet chosen | AP-7 | Choose before 2B notifications (NFR-13, NFR-18) |
| AWS Secrets Manager, CloudWatch | Vercel/Supabase secret stores; Sentry + Supabase logs | ADR-002 | — |
| NFR-01 "AWS Sydney" | Supabase and Vercel in Sydney, on AWS | AP-2 approved | — |
| NFR-05 35-day backups, RPO 1 h | Free plan: none | AP-3 (Ahmad), AP-9 | Pro + PITR before pilot |

## 2. Interpretations I-01–I-13: resolved

| ID | Spec says | Result |
|---|---|---|
| I-01 Fleet Manager or above | App. B.1 matches | ✅ Confirmed |
| I-02 Who edits the register | B.1: **Fleet Manager can create and edit assets and client records**. Import, conversion, archive and restore stay Owner/Administrator. Sites stay Owner/Administrator (FM view) | ❌ **Change**: §3 item 2 |
| I-03 Viewer and costs | EXP-03 and B.1: **Viewer sees costs** (view only) | ❌ **Change**: §3 item 3 |
| I-04 Mandatory fields | AST-01: vehicles need **registration or VIN**; equipment needs **serial or asset number** | ❌ **Change**: §3 item 4 (current rule is stricter) |
| I-05 Duplicates | AST-05 matches (warning + reason; no cross-org checks) | ✅ Confirmed |
| I-06 Meter jump | AST-10 / CFG-44: 2,000 km or 24 h per elapsed day | ✅ Confirmed |
| I-07 Grant eligibility | §3.2 matches | ✅ Confirmed |
| I-08 Ownership changes | ACC-09, ACC-17: transfer is an Owner action | ✅ Confirmed; transfer workflow still to build |
| I-09 Support access length | ADM-07: **60 minutes, read-only unless the Owner approves editing** | ❌ **Change**: §3 item 5 |
| I-10 Password policy | ACC-01: at least 10 characters + breached-password check; no composition rule | ❌ **Change**: drop the "number or symbol" rule; enable leaked-password protection |
| I-11 Job Manager acceptance | B.2: Job Managers post and accept (fees) | ✅ Confirmed |
| I-12 Company approval | Not in spec; self-serve | ✅ Confirmed (AP-5) |
| I-13 Out-of-sequence readings | AST-10, §14.4 match | ✅ Confirmed |

## 3. Corrections to the built 2A

Each item needs a new migration and, where permissions change, an update to `packages/permissions/src/matrix.ts`. Hosted changes need Ahmad's approval.

**Approved 10 Nov 2026 (Ahmad, for HVEMS):** items 2–13, including item 9 (MFA recovery codes and Owner/Admin MFA reset). They are now build work, scheduled before 2B.

| # | Spec | Current build | Change |
|---|---|---|---|
| 1 | §2.3, §2.5, §2.7 (D-06 confirmed): sessions bound to one audience; cross-portal switch by a single-use 60-second handoff token | ✅ **Done 9 Nov 2026** (ADR-009): five portals by host, host-only session cookies, signed 60-second single-use handoff | Remaining: the one-active-organisation-per-tab rule is met by the org id in the URL; switches are logged in `security_events` |
| 2 | B.1 | ✅ **Done 10 Nov 2026** (`register_corrections`): Fleet Managers create and edit equipment and clients; import and archive need `assets.import_archive` (Owner/Administrator). Was: `assets.manage` and `clients.manage` Owner/Administrator only | Split into `assets.edit` (Own/Adm/FM) and `assets.import_archive` (Own/Adm); give FM `clients.manage` |
| 3 | EXP-03 | ✅ **Done 10 Nov 2026**. Was: Viewer lacks `assets.costs.view` | Grant it (view only) |
| 4 | AST-01 | ✅ **Done 11 Nov 2026** (`asset_either_or_fields`). Was: vehicles: make, model, rego, state, VIN; plant: make, model, serial | Vehicles: rego **or** VIN; equipment: serial **or** asset number (always present). Needs either-or rules, not a flat field list |
| 5 | ADM-07 | ✅ **Done 11 Nov 2026** except edit mode (`support_access_owner`): 60 min, read-only, Owner notified and can end. Was: 240-minute limit; no mode | 60 minutes; read-only by default; edit mode only with Owner approval; session shown to the Owner (NOT-01) |
| 6 | AST-13 | ✅ **Done 10 Nov 2026**: retired → disposed; transferred out and written off added; transfers also need open issues acknowledged. Was: retired / sold / other | Reasons: sold, disposed, transferred out, written off, other |
| 7 | §4.3, AST-16, §10.2 | ✅ **Done 11 Nov 2026** (`asset_count_events_detail`). Was: count events hold delta + reason | Add count before/after, actor, and a `merged` reason (AST-05) |
| 8 | AUD-01–03 | Actor, method, action, entity, changes | Add portal, IP/device, before/after values, **daily hash chain** (AUD-03), **filters + CSV export** on the audit viewers (AUD-02) |
| 9 | ACC-03 | ✅ **Done 11 Nov 2026** (`mfa_recovery_and_reset`). Was: TOTP only | 10 single-use **recovery codes** (custom table, hashed) plus Owner/Admin MFA reset for members (ACC-15) |
| 10 | §2.5, CFG-45 | ✅ **Done 11 Nov 2026** (`password_lockout_idle_timeout`); direct Auth API calls not counted until an Auth hook is available (paid plan). Was: Supabase defaults | Lockout after 10 failed passwords for 15 min; idle timeout: portals 12 h, console 30 min (ADM-01) |
| 11 | ACC-04 | ✅ **Done 10 Nov 2026** (`organisation_timezone_contact`): timezone chosen at sign-up (Brisbane preselected) and in Settings; every member sees dates and times in it; contact name, email, phone. Was: name, ABN | Add default timezone (Brisbane preselected) and contact details |
| 12 | §2.5 (IR) | Staff can also hold memberships | Prevent staff accounts holding customer/provider memberships, or record the deviation. The current test accounts already follow this |
| 13 | ACC-01 | Sign-up is generic; account type chosen at onboarding | Acceptable, as long as each portal offers only its own types. Check when provider sign-up moves to its own host |

## 4. Things the spec adds that the roadmap must carry

- **2B:** driver profiles (D-0001 IDs, 72-hour setup code), equipment codes (128-bit token + 10-character typed code), code-label reports (3/device/hour, bot protection), escalation timings, the condition test matrix T-12 (18 rows) and **NFR-17/18**.
- **2C:** malware scanning, 17.3 file limits, the 15 reports (RPT-02), compliance summary, PDFs.
- **2D:** the full fee/waiver ledger (§11), the acceptance-attempt state machine (§7.5), Appendix F settings CFG-01–48 (check `platform_settings` against it), ADM-10 helpdesk ticket context.
- **Acceptance:** Appendix E T-01–T-47 becomes the E2E test list. T-01 (isolation) and T-02/T-03 apply to 2A now.

## 5. Omnific IT decisions (9 Nov 2026, Ahmad)

**Approved 10 Nov 2026:** HVEMS has approved O-01 to O-05, including the change-control acknowledgement for O-01 (MKT-02) and the support-access exception in O-05.

| # | Decision | Spec items affected | Notes |
|---|---|---|---|
| O-01 | **No ABN Lookup integration.** Provider ABNs are checked with the checksum (DB + TS, already built). The Verification Officer confirms the ABN is active and matches the business name by hand, and records that in the verification decision | INT-04, MKT-02 ("automatic ABN Lookup"), ADM-03, T-24 | MKT-02 is a BR, so HVEMS must acknowledge it through change control. `ABR_GUID` removed from `.env.example` |
| O-02 | **Naming.** The HVEMS platform owner's console role is the **Super Admin** (code: `platform_administrator`). Company-level managers are **Company Admins**. They are customers who manage only their own company | Glossary; UI labels | Display names only, no schema change. Company roles stay Owner and Administrator in the database, because the spec gives them different powers (billing, closure) |
| O-03 | **Company asset classes**, as well as HVEMS standard classes. Owner, Company Admin and Fleet Manager can add a class while creating equipment; it's saved for that company only and reused. Each class is based on a category (vehicle or equipment), which sets mandatory fields and keeps billing and waiver counts correct. The Super Admin can add standard classes for every company | AST-02 ("classes maintained by HVEMS"), INS-04 (templates by class, 2B) | Extends a BR, so HVEMS should acknowledge it through change control. Migration `asset_classes_and_meters`; capability `asset_classes.manage` |
| O-04 | **Either meter unit on any asset.** An hours-only asset can record an odometer reading and the reverse. A manager role (`meter_readings.accept`) confirms it, and the asset's meter switches to both; the change is audited | AST-01 (meter type), AST-10 | An extension of AST-10 behaviour; no conflict with a BR |
| O-05 | **Super Admin sees every organisation's team and fleet** (equipment, clients, sites, meter readings, condition) at any time, read-only, with MFA. Support Agents keep the support-access rule. Each time the Super Admin opens an organisation's team or fleet, a `hvems_staff_viewed_records` security event is written for that organisation | §2.3 ("customer data outside a support access session: can't reach"), ADM-07, CS-06, NFR-09 | **Departs from the agreed privacy design**, so HVEMS must approve it through change control and the privacy policy must disclose it. Migration `super_admin_fleet_read`; pgTAP `040` |
| O-06 | **MFA for everyone, later (10 Nov 2026).** For now the SoW §2.5 rule stays: staff always; Owner/Admin/Finance once there are 2+ members or a payment method; Provider Owner once there is a payment method. Later, MFA will be required for **every user, whatever their role or account state**. Build the recovery-code work (§3 item 9) so this switch is one platform setting (`mfa_required_for_all`, default off) read by `app.mfa_required`, not a code change | §2.5, ACC-03 | Switch-on date to be set by HVEMS. Drivers and technicians will need an authenticator app before it is turned on |
| O-07 | **Critical alerts go to both the Owner and the Fleet Manager(s)** of the company by default (10 Nov 2026). Either can acknowledge; escalation at 30 min / 2 h follows the spec | 2B critical alerts, NOT-* | Default recipients kept in settings so HVEMS can change them |
| O-08 | **Timezones (10 Nov 2026).** The platform and the Super Admin console use Australia/Brisbane. Each organisation chooses its own timezone (Brisbane preselected), and all its members (Company Admins, Fleet Managers, drivers, technicians…) see dates and times in it. Sites keep their own timezone for due dates and inspection days. Billing and waiver months stay on Queensland time (SoW §5) | ACC-04, §12.1 | Built with item 11 |
| O-09 | **Owners and Fleet Managers hold the clearance powers by role (10 Nov 2026).** They triage defects, lower severity, dismiss, defer Minor repairs, mark Critical repairs done and return equipment to service without a separate grant; Company Admins inherit this as the level above Fleet Manager. The Clearance Authority grant stays for other roles (e.g. technicians). Two-step clearance kept: marking a Critical defect repaired leaves the equipment Out of service until a separate Return to service | SoW §2.4 grants table (Clearance Authority), §3.4 | HVEMS decision through Ahmad; the company rule "repairers can't clear their own Critical repairs" still applies |
| O-10 | **QR codes and driver sign-in (10 Nov 2026).** A QR code is created only when a manager presses *Generate QR code* on the equipment and belongs to that equipment only. Scanning opens the pre-start for that equipment after the operator signs in: Driver ID + 6-digit PIN (first time: setup code from the manager, valid 72 h), or a member's own email login, so every pre-start records who did it. No anonymous "report a problem" page (spec's public code-label reports not built). Drivers only see equipment ticked for them on the Drivers page. Driver profiles don't count as member logins for the 5-login limit or the MFA rule | CS-10, ACC-11/12, code-label reports | 5 wrong PINs lock for 15 min (settings) |
| O-11 | **Stricter sign-in (11 Nov 2026, Ahmad).** Lock after **5** wrong passwords (spec: 10) for 15 minutes; the sign-in page shows the tries left from the 3rd wrong password. Portal idle timeout **3 hours** (spec: 12 h); the console stays at 30 minutes. The Owner and Company Admins can clear a member's wrong passwords or lock from the Team page; the Super Admin can for anyone from the console. Every unlock is a security event | §2.5, CFG-45 | Settings `security.password_max_attempts`, `security.password_warn_after_attempts`, `security.idle_timeout_minutes_portal`. Migration `lockout_five_tries_unlock`; pgTAP `140`, `150` |
