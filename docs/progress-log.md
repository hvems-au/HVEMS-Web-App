# Development progress log

## 2026-11-10 — Session 2 (continued): defect triage and two-step clearance
**Done**
- Decision O-09: Owners and Fleet Managers (and Company Admins) hold the clearance powers by role; capability seed + `matrix.ts` updated.
- Migration `20261110071142 defect_triage_clearance` (applied by Claude): defect statuses repaired / dismissed / merged; triage (raise freely; lower with a reason, and a photo for Critical), dismiss, merge (kept defect takes the more serious severity), defer Minor (reason, at most 30 days past due), mark repaired (repairer recorded; company rule "repairers can't clear their own Critical repairs" enforced), return to service (separate step, only when no other Out-of-service cause is open; recorded in `return_to_service_events`). Minor defects get a due date (7 days, setting). pgTAP `080`; `010` updated.
- Web: defect page with Next step (Mark repaired, Triage, Defer, Merge duplicate, Dismiss) and evidence photos; Defects list with Open / Closed tabs, New, Due and Overdue badges; equipment page banner "Repaired: waiting to return to service" with the Return to service dialog.
- Checked: hosted smoke test (rolled back) and in the browser on CAT-ESC-0001: Advisory raised to Critical -> Out of service; marked repaired with a photo -> still Out of service, banner shown; returned to service -> Active. The test defect is now closed as Repaired.

## 2026-11-10 — Session 2 (continued): pre-start inspections (first version)
**Done**
- Migrations `20261110052909 prestart_inspections` and `20261110052952 prestart_fk_indexes` (applied by Claude): standard templates seeded from the P-01 draft (10 templates, 95 items; SoW severities Critical / Minor / Advisory), `inspections`, `inspection_answers`, `inspection_photos` (private `inspection-photos` bucket, org-scoped storage policies), `defects`, `notifications`; RPCs `prestart_checklist`, `submit_prestart`, `mark_notifications_read`. Operator items (fit for work, licence) fail the pre-start without a defect. Critical faults open a condition cause (Out of service); Minor faults Needs attention; Owner and Fleet Managers notified (O-07). Repeat faults don't duplicate open defects. Pre-starts are append-only.
- Web: Pre-start button on the equipment page; pre-start form with the auto-filled header (equipment ID, class, make/model, rego, VIN/serial, site, client, last odometer and hours, operator, date), meter readings, OK / Fault / N/A per item, "Mark rest OK", notes on faults, photos (recommended, compressed, uploaded to private storage), general notes and photos, declaration. Result page with the outcome banner; Inspections list; Defects & Safety list; Alerts page with unread badge on the bell. Equipment page shows open defects and recent pre-starts.
- Checked: hosted smoke test in a rolled-back transaction (trailer: 47 items; critical fault -> fail, Out of service, defect, owner notified; nothing persisted). Browser: a pre-start with an Advisory fault and a photo on CAT-ESC-0001 (kept as test data; the trailer stays Active). pgTAP `070`.

**Not yet (rest of 2B)**
- Defect triage, repair, two-step clearance and return to service (defects stay open until then); alert acknowledgement and escalation; driver PIN sign-in; template editor; Mobile crane class and add-on sections.

## 2026-11-10 — Session 2 (continued): approved corrections, batch 1
**Done**
- Item 11 and decision O-08 (migration `20261110050534 organisation_timezone_contact`): organisation timezone chosen at sign-up and in Settings, used for every date and time members see; contact name, email, phone; unknown timezones refused by the database. pgTAP `060`. Browser-checked: switching to Perth shows meter times two hours earlier; restored to Brisbane. Fixed the timezone select showing the old value after saving.
- HVEMS approved O-01 to O-05 and reconciliation §3 items 2–13. New decisions O-06 (MFA for every user later, as a setting) and O-07 (critical alerts to Owner and Fleet Managers).
- Items 2, 3, 6 (migration `20261110044311 register_corrections`, applied by Claude): Fleet Managers create/edit equipment and clients; import and archive need the new `assets.import_archive` (Owner/Administrator); Viewers see costs; disposal reasons disposed / transferred out / written off / sold / other. pgTAP `050`; test `020` updated. Types regenerated; advisors unchanged.
- Equipment page: a disabled **Pre-start — Coming soon** button. Checklist content is pending decision P-01 (`docs/roadmap.md`, "Pending decisions").

## 2026-11-10 — Session 2 (continued): Super Admin sees all organisations' team and fleet
**Done**
- O-05: read-only access for the Super Admin (Platform Administrator + MFA) to every organisation's equipment, clients, sites, meter readings and condition records; Support Agents unchanged. Applied by Claude through the Supabase connector (first use of the new local permission); recorded as `20261109123912 super_admin_fleet_read`; checked by simulation (MFA: sees all; no MFA: nothing).
- Console: Organisations list shows member and equipment counts; each organisation has Details, Team, Equipment and Clients & Sites tabs. Opening a team or fleet tab writes a `hvems_staff_viewed_records` security event for that organisation.

**Waiting on**
- HVEMS approval of O-05 (privacy change) and a privacy-policy update.

## 2026-11-10 — Session 2 (continued): custom asset classes; either meter unit
**Done**
- Company asset classes (O-03): "+ Add a new class…" in the equipment form for Owner, Company Admin and Fleet Manager; the class is saved for the company and offered again. Super Admin → Asset Classes lists the standard classes and adds new ones for everyone. The database keeps each company's classes private and stops an asset using another company's class.
- Either meter unit (O-04): the meter form offers odometer and hours; a manager can tick "also track…" and the asset switches to both (audited).
- Migration `20261110090000_asset_classes_and_meters`, applied by Ahmad through the SQL editor and verified; types regenerated; the capability drift test now reads every migration. Browser-tested: class created and reused, equipment saved, odometer recorded on an hours machine.

## 2026-11-09 — Session 2 (continued): edit clients/sites; Super Admin organisation management
**Done**
- Edit clients and sites (company portal, `clients.manage` / `sites.manage`); cleared fields are stored as empty; client notes not on the form are left alone. Browser-tested.
- Super Admin: `/admin/organisations/[id]` to edit name, legal name, ABN and timezone, and to de-activate (suspend) or reinstate with a reason (ADM-02, ACC-18). Support Agents can view only (B.5). Banners in the company and provider portals while suspended.
- Migration `platform_organisation_admin` + pgTAP `030`: RPCs `admin_update_organisation`, `admin_set_organisation_suspended` (Platform Administrator + MFA), suspension blocks new equipment, invitations and members; safety functions continue. Dry-run on the hosted project inside a rolled-back transaction: all checks as expected.

- Migration applied by Ahmad through the SQL editor (recorded as `20261109160000 platform_organisation_admin`); verified columns, functions, privileges and triggers; types regenerated; advisors show no new findings.

**Waiting on**
- A Super Admin browser test of the edit and de-activate screens (needs an MFA sign-in).

## 2026-11-09 — Session 2 (continued): five portals
**Done**
- ADR-009: Super Admin console, company portal (with marketplace inside), marketplace (marketplace-only customers), provider portal and driver sign-in, each on its own host with its own session.
- Signed, single-use 60-second portal handoff (`/auth/handoff`), logged in `security_events`; per-portal login, sign-up, onboarding and email links.
- Sign-in now does a full-page navigation after success: the in-action redirect rendered the target before the new session cookie was visible, which showed the login page again.
- Placeholders on the login, sign-up, forgot-password and reset-password fields. Super Admin naming; ABN Lookup dropped (O-01).
- Checked in the browser (Edge): separate sessions per host; handoff works once, and a reused or tampered token is refused; a company org gives 404 on the marketplace host; signing out of one portal keeps the others signed in. Vitest 121/121.

**Waiting on**
- Supabase Auth redirect allow-list entries need a trailing `**` (`http://company.localhost:3000/auth/callback**` etc.); production hosts once the domain is live.
- Production domain names for the five hosts.

## 2026-11-09 — Session 2: console, brand, development specification
**Done**
- Local run documented: `corepack pnpm install`; start with `corepack pnpm --filter @hvems/web dev` (the root scripts call `pnpm` recursively, which fails when pnpm is only available through corepack).
- Test accounts on the hosted project: Platform Administrator `ahmad.khattak@omnificit.com.au`; company "Omnific Developers" owned by `ahmad.khattak@omnificdevelopers.com`. Change the temporary passwords before any real use.
- Admin host: "Administrator Login" title and subtitle; no sign-up option; `/sign-up` redirects to `/login` (`lib/admin-host.ts` shared with `proxy.ts`).
- Console Audit History (`/admin/audit`): every organisation plus platform-level events, filters by organisation and record. RLS checked by simulation: staff with MFA see everything, staff without MFA see nothing, company owner sees only their own company.
- Brand Identity Guidelines v1.0 applied: Montserrat, Charcoal `#444444`, Orange `#CE5502`, type scale utilities (`docs/design/brand.md`).
- Development Specification v2.2 received and reconciled (`docs/requirements/dev-spec-reconciliation.md`); AP-6 resolved.

**Waiting on**
- Approval to implement the spec corrections (reconciliation §3 items 2–8, 10–12) on the hosted project.
- Decision on per-portal sessions and handoff (§3 item 1, D-06) and on the MFA recovery-code approach (item 9).

## 2026-11-09 — Session 1 (continued): hosted database
**Approvals received (Ahmad):** AP-1 apply migrations ✅ · AP-2 hosting (Supabase ap-southeast-2 + Vercel `syd1`) ✅ · AP-3 backups — owned by Ahmad, outside this workstream.

**Done**
- Applied `foundation`, `identity`, `fleet` to project `anvqykllajezwaasguqp`; renamed local migration files to the hosted versions.
- Ran security and performance advisors; added `fk_indexes` migration (tenancy FK indexes) and recorded the accepted findings in `docs/database/schema.md`.
- Hosted smoke test (PG 17), rolled back: 24/24 checks as expected; verified nothing persisted.
- Generated `packages/types/src/database.generated.ts`; added a compile-time drift check (`schema-compat.ts`) between generated enums and the shared types.
- pgTAP 130/130 and Vitest 107/107 re-run with the renamed migrations; typecheck clean.

**AP-5 resolved (Ahmad):** build follows the SoW for F-01–F-12. F-04 no company approval gate; F-06 providers use a customer account under the same login (pointer added to the provider dashboard); F-08 no in-app tickets — the support link now comes from `NEXT_PUBLIC_SUPPORT_URL` and is hidden until HVEMS names its helpdesk (the hard-coded, unverified address was removed).

**Waiting on**
- Auth dashboard settings (Site URL, redirect URLs, leaked-password protection, TOTP).
- AP-4 (connection-fee hold-then-charge design and terms wording) — explained, not yet approved.
- Name of HVEMS's helpdesk product / contact form URL (F-08).

**Next**
- Playwright E2E against the hosted project (CI) → increment 2B Safety.

## 2026-11-09 — Session 1
**Done**
- Repository `ahmadkhattakOD/HVEMS-Web-App` created and pushed (5 commits).
- Read the Client Scope of Work v2.2 in full; Figma analysed (117 frames); Supabase project inspected (Sydney, PG 17, empty, Free plan).
- Monorepo scaffolded; shared packages (domain, permissions, validation, types, api-client, ui, config).
- Migrations: foundation (settings, audit, security events), identity (orgs, memberships, roles/grants/capabilities, invitations, staff, support access, payment-method stub, MFA rule, RPCs), fleet (classes, clients, sites, assets, count history, consent, operator permissions, condition engine, meter readings, archive, import).
- Web app: auth flows, MFA, onboarding, context switcher, Customer/Provider/Admin shells, dashboard, equipment list/detail/create/edit/archive/import, meter readings, clients & sites, team & grants, settings, audit history.
- Tests: pgTAP 130/130, Vitest 107/107, typecheck, lint (0 errors), production build; visual check against Figma.

**Blocked / waiting**
- AP-1 approval to apply migrations to the hosted project.
- Network access to `*.supabase.co` from the dev environment for browser E2E (or run E2E in CI).

**Next**
- Apply migrations → remote pgTAP → advisors → generated types → Auth configuration → Playwright E2E → start 2B.
