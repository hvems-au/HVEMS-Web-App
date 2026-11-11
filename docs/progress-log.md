# Development progress log

## 2026-11-11 — Current operator, custom pre-start days, "Operator" wording, inspection filters, simpler screens
**Done**
- Migration `20261111152534 current_operator_custom_prestart` (applied by Claude): `assets.current_operator_id/_since`, set only by a trigger when a pre-start is submitted (a later pre-start by someone else moves it; a late-synced older one doesn't); backfilled from the latest pre-starts. Prestart frequency `custom` with `prestart_every_days` (2–365, required for custom, cleared otherwise); `detect_missed_prestarts` records a custom miss when N days pass with no pre-start, once per N days. `20261111200000 operator_wording` (recorded in history; applied with the first): credential alerts say "Operators page". pgTAP `260`.
- Web: "Operator" replaces "Driver" in every screen, alert label and the role name; Operator IDs show as OP-0001 (D-0001 still accepted). Equipment shows the current operator (detail and list column). Equipment form: "Every few days (custom)" with a days field. Inspections: filters for equipment, operator, result and dates; Missed tab filters for equipment and check. Dashboard: new "To do" card (critical/other defects, missed pre-starts, overdue/due-soon services, work orders); the out-of-date "Coming in the next increments" card is gone; long text behind "Read more". Shorter page descriptions.
- Planned for 2D: "Post to marketplace" from a work order (roadmap).
- Checked on the hosted project (rolled back): operator link, custom days refused without a number, custom miss recorded once per period, days cleared on change.

## 2026-11-11 — 2C slice 1: service plans, schedule, work orders (CS-17, CS-18)
**Done**
- Migration `20261111124944 maintenance_work_orders` (applied by Claude): `service_plans` (every N days / km / hours, last done), view `service_schedule` (security invoker: next due from the last service and the latest accepted readings; Overdue / Due soon / OK with thresholds in settings `maintenance.due_soon_*`); overdue plans open an `overdue_service` condition cause (Needs attention only where the company rule is on), resolved automatically when serviced (pg_cron `hvems-overdue-services` hourly and on plan changes); `work_orders` (WO-0001…, in-house or named vendor, assignee, priority, due) with `create_work_order`, `update_work_order_status` (technicians start / complete with notes, readings, labour, cost in cents; managers close, reopen with a reason, cancel with a reason) and `update_work_order`. Closing a service work order records the service as done. Work orders never clear safety causes. Everything audited. pgTAP `250`.
- Web: **Maintenance** page (schedule, Add service plan, Work order from a plan, Remove) and **Work Orders** (Open / Closed and cancelled, New work order, detail page with actions). Navigation now opens the real pages.
- Checked: on the hosted project as the Owner (rolled back) and in the browser: plan Due soon → WO-0001 started, completed ($245.50, 1.5 h), closed → plan OK with next due 11/12/2026; the test plan was removed afterwards (WO-0001 stays as an example).
- Note: the new tables are queried through an untyped client in the API client until `database.generated.ts` is regenerated.

## 2026-11-11 — Pre-start frequency and missed pre-starts (2B)
**Done**
- Migration `20261111122758 prestart_frequency_missed` (applied by Claude): `prestart_frequency` (daily / weekly / not required) on equipment types (vehicles and mobile plant daily, portable or fixed equipment weekly) with a per-equipment override; `missed_prestarts`; hourly pg_cron job `hvems-missed-prestarts` checks each company in its own timezone after each day (Monday–Sunday for weekly checks) ends: current equipment due a check with no pre-start is recorded, out-of-service / archived / later-added equipment is left out, weekends skipped for daily checks (setting `prestart.skip_weekends`); one alert to the Owner, Fleet Managers and Company Admins. `review_missed_prestart` (inspections.review): "not used" or "missed" (note required), audited.
- Web: Inspections → **Missed** tab with the open count, Review dialog and a Reviewed list; equipment form "Pre-start checks" (As per type / Daily / Weekly / Not required) and the equipment page shows it. pgTAP `240`.
- Checked on the hosted project: the first run recorded WC-1 (no pre-start on Tue 10/11; CAT-ESC-0001 had one). Browser: "missed" without a note refused; reviewed as "Not used" (note: "Water cart parked all day (test review)"); the form option shows.
- Decision (Ahmad): HVEMS support sessions and member sign-in locks stay visible to companies on the Team page.

## 2026-11-11 — Support PIN, change password, credential alerts to Company Admins
**Done**
- Decisions (Ahmad): (1) HVEMS support needs a company's **support PIN** to open a session: 6 digits, shown to the Owner and Company Admins in Settings → Security (Show / New PIN now), changes every 4 hours (setting), derived from a per-company secret nobody can read; 5 wrong PINs lock that staff member out of that company for 15 minutes; every attempt recorded. (2) Expired driver credentials only warn; Company Admins now get the alerts too. (3) **Change password** for every user on Account security (current password checked on a separate session so the MFA session stays; counts towards the lockout; recorded as a security event).
- Migration `20261111190000 support_pin` (`start_support_access` now takes the PIN and returns a result); pgTAP `230`; `010` and `180` updated. Applied by Ahmad in the SQL editor (the connector refused `drop function`); history entry added. Browser-checked: the Owner sees the PIN in Settings → Security; a throwaway Support Agent (deleted) was refused with a wrong PIN, got in with the right one, and the Owner ended the session. The empty marketplace test account was removed (Ahmad, SQL editor).
- Console: PIN field on "Start support access". Browser-checked: change password (wrong current refused, new one signs in, old one refused; throwaway user deleted).

## 2026-11-11 — Sign-in & security events: Super Admin only
**Done**
- Decision (Ahmad): sign-in and security events are for the platform's Super Admin only. Company and provider audit pages show changes only (the tab, the URL and the CSV export all fall back to changes); in the console the tab shows only for the Super Admin. Companies still see HVEMS support sessions and member sign-in locks on the Team page.
- Migration `20261111180000 security_events_super_admin_only` (read policy: Super Admin with MFA only); pgTAP `220`. Applied by Ahmad in the SQL editor (the connector refused `drop policy`); history entry added. Checked: the Owner (with MFA) now sees 0 security events.

## 2026-11-11 — Housekeeping
**Done**
- Australian terms in database messages: `australianWording` in the API client rewrites "meter type", "this meter" and "meter reading(s)" to odometer / hour meter wording for every coded database error (web and mobile alike); unit test.
- CI: `actions/checkout@v5` (runs on Node 24; v4 raised the Node 20 deprecation warning).

## 2026-11-11 — Equipment count history detail (AST-16)
**Done**
- Reconciliation item 7. Migration `20261111104734 asset_count_events_detail` (applied by Claude): every count event records `count_before`, `count_after` and `actor_user_id`, filled by the database (one writer per organisation at a time); `merged` added as a reason (AST-05). Earlier events keep their original fields (append-only).
- Console organisation Details tab: "Equipment count history" (latest 20). Checked on the hosted project as the Owner (rolled back): adding equipment records 2 → 3 with the right person; console card checked with a throwaway Super Admin (deleted). pgTAP `210`.

## 2026-11-11 — Either-or mandatory fields (AST-01)
**Done**
- Reconciliation item 4. Migration `20261111104208 asset_either_or_fields` (applied by Claude): vehicles need make, model and a **registration or a VIN** (a registration always needs its state); equipment needs make and model (the asset number identifies it; serial optional). `required_fields` entries like `registration_number|vin` mean "at least one", so HVEMS can still change the rules as data; company classes follow the same rule.
- Form: the same rule for instant feedback, with "Registration or VIN: at least one" hints; console class list shows "Registration or VIN". Checked on the hosted project as the Owner (rolled back): a truck with only a VIN saves; with neither it is refused. pgTAP `200`; `020` updated (serial no longer required).

## 2026-11-11 — HVEMS staff accounts kept separate
**Done**
- Migration `20261111103641 staff_account_separation` (applied by Claude): a staff login can't join, create or be invited into a customer organisation (`staff_account`), and a member of one can't be made HVEMS staff (`member_account`). The only staff account had no memberships. Checked on the hosted project that ordinary sign-up still creates an organisation (rolled back). pgTAP `190`.

## 2026-11-11 — Support access (ADM-07, NOT-01)
**Done**
- Reconciliation item 5. Migration `20261111102856 support_access_owner` (applied by Claude): sessions at most **60 minutes** (setting, was 240), reason of at least 10 characters, one active session per staff member and organisation; read-only (support sessions only widen read policies). The Owner (and anyone with `support_access.view`) is notified when a session starts and can end it (`owner_end_support_access`); who ended it is recorded; every step is a security event.
- Console organisation page: "Start support access" (reason, 15–60 minutes) or the active-session banner with End now; Support Agents see Team, Equipment and Clients only during their session (the Super Admin directly, O-05). Company Team page: "HVEMS support access" card with recent sessions and End now.
- pgTAP `180`. Browser-checked with a throwaway Support Agent (deleted): fleet hidden → session started → visible; Owner notified, ended it from the Team page → hidden again.
- **Not built:** edit mode with the Owner's approval. The console has no screens for editing company records, so what support staff could change needs a decision first.

## 2026-11-11 — Audit upgrade (AUD-01–03)
**Done**
- Reconciliation item 8. Migration `20261111102026 audit_upgrade` (applied by Claude):
  - Every audit and security event records the portal, IP address and browser (headers the HVEMS server sends; a trigger copies them into `context`). Before/after values for changes were already recorded.
  - Daily hash chain: `audit_daily_digests` (append-only), one SHA-256 digest per Brisbane day over that day's audit and security events, chained to the previous day; sealed by pg_cron `hvems-seal-audit-days` at 00:10 Brisbane. `verify_audit_chain` (HVEMS staff with MFA) recomputes it and lists broken days. Days so far sealed on the hosted project.
- Audit pages (company, provider, console): tabs **Changes** and **Sign-in & security**; filters (dates, record, action, person; event type; organisation in the console); **Export CSV** with the same filters (up to 5,000 rows); "From" column (portal · IP, browser on hover). Console shows the integrity check ("Audit records intact", or the changed days).
- pgTAP `170` (context, sealing, tamper detection). Browser-checked: a credential added and removed shows portal and IP; record filter; security tab; CSV download.
- Limit: someone with full database access could rewrite both the events and the digests; copying each day's digest outside Supabase (e.g. emailed to HVEMS) would close that once email is set up (P-02).

## 2026-11-11 — Driver credentials (2B)
**Done**
- Migration `20261111094848 driver_credentials` (applied by Claude): driver licence, plant ticket (HRWL), induction card, track safety and other credentials on the driver profile (number, class/name, issuer, optional expiry). Managers with `drivers.manage` maintain them; the driver sees their own; one of each kind and class per driver; every change audited.
- Daily pg_cron job `hvems-credential-expiry` (7 am Brisbane) notifies the Owner and Fleet Managers once when a credential is within 30 days of expiry (setting `drivers.credential_warning_days`) and once when it has expired; a new expiry date starts again. New notification kinds `credential_expiring` / `credential_expired`.
- Drivers page: Credentials column (expired red, expiring amber, otherwise "N current") and a Credentials dialog (add, edit, remove). Domain helper `credentialStatus` with tests; pgTAP `160`.
- Browser-checked on D-0001: licence added, amber warning shown, duplicate refused, removed again.
- Not built: an expired credential does not yet stop a driver from doing a pre-start (needs a decision).

## 2026-11-11 — O-11: lock after 5 tries, tries-left counter, unlock by Owner / Company Admin / Super Admin, 3-hour idle
**Done**
- Decision O-11 (Ahmad). Migration `lockout_five_tries_unlock`: settings 5 tries and 180-minute portal idle timeout, new `security.password_warn_after_attempts` (3); `record_password_sign_in` returns the tries left; `member_sign_in_locks`, `unlock_member_sign_in` (`org.members.manage` + MFA rule) and `admin_unlock_sign_in` (Super Admin with MFA, recorded against each of the person's organisations).
- Sign-in page: from the 3rd wrong password, "N tries left before this account is locked for 15 minutes". Team page: "N wrong passwords" or "Locked until 3:42 pm" badge with Unlock; same on the console's organisation Team tab for the Super Admin.
- pgTAP `140` updated for 5 tries; new `150` (unlock rules).
- Applied by Ahmad in the SQL editor (the connector refused it); history entry added. Browser-checked with a throwaway company (deleted): tries left shown at the 3rd and 4th wrong password, locked at the 5th, the Owner (with MFA) unlocks from the Team page, the member then signs in.
- MFA screen simplified: "MFA required" heading and one line about the authenticator app (no role rules). Branded loading screen (HVEMS logo, pulse, orange bar): full screen outside the portals, in the content area inside them (`components/brand/brand-loader.tsx`).

## 2026-11-11 — Password lockout and idle timeouts
**Done**
- Reconciliation item 10 (SoW §2.5, CFG-45, ADM-01). Migration `20261111084221 password_lockout_idle_timeout` (applied by Claude):
  - 10 wrong passwords in a row lock the email address for 15 minutes; failures older than 24 hours are forgotten; a successful sign-in or a password reset clears the count. Unknown addresses are counted the same way (no account enumeration). Every failure and lock is a security event.
  - `password_sign_in_status` / `record_password_sign_in` are callable only by the server (service role); the lock table has no direct access.
  - Settings: `security.password_max_attempts`, `security.password_lockout_minutes`, `security.password_failure_window_minutes`, `security.idle_timeout_minutes_portal` (720), `security.idle_timeout_minutes_console` (30).
- Web: one `passwordSignIn` wrapper (`lib/sign-in-lockout.ts`) used by the portal login and the driver portal's email sign-in; a locked account is refused before the password is checked, with the unlock time in Brisbane time.
- Idle timeout: the proxy keeps the last request time in an httpOnly cookie tied to the session id (a new sign-in starts fresh) and signs out a session idle past the limit (`/login?reason=idle`, driver portal back to `/driver`). The shell also signs out an open, unattended screen at the limit, with a one-minute warning; activity in any tab of the portal counts.
- Checked on the hosted project and in the browser with a throwaway user (deleted): 10th wrong password locks, the right password is refused while locked, sign-in works once unlocked; a 13-hour-old activity cookie signs the session out; the screen timer warns and signs out. pgTAP `140`; unit tests for the activity cookie.
- **Limit:** the count covers sign-ins through HVEMS. Someone calling Supabase Auth's API directly with the public key isn't counted (Supabase's own rate limits still apply). Closing that needs Supabase's password-verification Auth hook, which the Free plan doesn't offer; revisit with P-03.

## 2026-11-11 — MFA recovery codes, MFA reset, "MFA for everyone" setting
**Done**
- Reconciliation item 9 (ACC-03, ACC-15) and O-06. Migration `20261111060000 mfa_recovery_and_reset`:
  - 10 single-use recovery codes per person (bcrypt hashes, no direct table access, shown once). Creating them needs an MFA session; a new set cancels the old one. 5 wrong codes lock recovery for 15 minutes (settings `security.mfa_recovery_*`); every attempt is a security event.
  - Owner / Company Admin reset of a member's MFA (needs their own MFA and a reason; not their own, not the Owner's, not driver PIN profiles). Super Admin console reset for anyone (reason of at least 10 characters, recorded against each of the person's organisations), for an Owner with no codes left.
  - `security.mfa_required_for_all` (off) read by `app.mfa_required`: when on, every member login needs MFA; Driver ID + PIN profiles stay out (O-10).
  - The database decides and records; the server then removes the person's authenticators through the Supabase Auth admin API (`lib/mfa-admin.ts`), only for the user id the database returned.
- Web: recovery codes shown straight after setting up an authenticator (copy, download, "I've saved these"); recovery-code status and "Create new recovery codes" on Account security; "Lost your phone? Use a recovery code" at the sign-in challenge; "Reset MFA…" in the Team member menu; "Reset MFA" on the console's organisation Team tab.
- Checked on the hosted project as signed-in users (rolled back): codes, wrong / right / reused code, no direct read, reset rules (Fleet Manager refused, own MFA needed, not the Owner, not yourself, reason needed). Browser end to end with a throwaway user (deleted afterwards): enrol → codes → new sign-in → wrong code → recovery code → authenticator removed → enrol again → new codes. pgTAP `130`.
- Note: the Supabase connector refused this migration three times although the project allows it; it had in fact been applied (running it again in the SQL editor reported that the table already existed). The history entry was added by hand afterwards.
- Also on 11 Nov: for about 10 minutes (3:10–3:21 pm Brisbane) adding equipment failed with "permission denied for function class_is_mobile_plant"; fixed by `20261111052125 safety_fitted_default_execute`.

## 2026-11-11 — QR label: driver portal address and company logo
**Done**
- The label's "No camera?" box shows the driver portal address. Labels always print the live address (`driver.hvems.com.au`, or the configured `DRIVER_HOST` when it isn't a local host), never a local one.
- Company logo (Settings → Company logo; Owners and Administrators): any image is converted to a PNG of at most 1000 px in the browser and uploaded to the private `organisation-logos` bucket (`<org>/logo-<id>.png`). Replacing or removing the logo deletes the old file. The label shows the logo in place of the company name. Migration `20261111045315 organisation_logo` (column, folder rule `invalid_logo`, bucket and storage policies); pgTAP `110`.
- Browser-checked: SVG logo uploaded, shown in Settings and on the label (one page); replace and remove leave no files behind. The test logo was removed afterwards.

## 2026-11-11 — Company logo everywhere; ROPS / FOPS / fire suppression "fitted" tick-boxes
**Done**
- Company logo also on the sidebar organisation badge (customer and provider portals), the pre-start PDF letterhead (beside the company details) and the driver's scanned-equipment screen. PDFs take the logo as raw bytes (react-pdf doesn't render data-URI images in repeating headers).
- Decision (11 Nov 2026, Ahmad): ROPS, FOPS and fire suppression checks follow "fitted" tick-boxes on each piece of equipment rather than its type, so mine-spec vehicles can carry them. Mobile plant starts ticked (no machine loses a check without someone deciding), vehicles unticked; existing equipment set the same way. Migrations `20261111050947 safety_equipment_fitted` (asset columns, class default, `requires_fitted` on template items, `app.prestart_items` filter, safety template version +1) and `20261111051527 safety_equipment_fitted_grants` (the assets table grants writes column by column). pgTAP `120`.
- Equipment form: "Safety equipment fitted" card; equipment page lists what is fitted.
- Browser-checked: ROPS ticked on the trailer → its pre-start shows ROPS but not FOPS; pre-start PDF and driver screen show the logo. Test changes reverted afterwards (trailer unticked, logo removed).

## 2026-11-10 — Session 2 (continued): QR codes, driver profiles and PIN sign-in; checklist v2
**Done**
- Decision O-10 (QR → sign-in → pre-start; codes generated on demand; no anonymous reports).
- Migrations (applied by Claude): `20261110083110 equipment_codes` (Generate / Replace code, revoked on archive, 10-character typed code), `20261110083349 driver_profiles` (D-0001…, setup code 72 h, bcrypt PIN, 5 wrong → 15 min lock, attempts kept even on failure, deactivate suspends the membership; driver logins excluded from the member limit), `20261110090424 mfa_rule_excludes_drivers` (adding a driver had forced the Owner into MFA), `20261110090332 prestart_content_v2` (client's sample Daily Plant Inspection Check List: separate ROPS and FOPS, fire suppression Critical, neutral start, chassis cracks, wheels/tyres/tracks, hitch pin, articulation, signs and reflective tape, spill kit, plant security; templates v2). pgTAP `100`; `070` count updated.
- Web: QR card on the equipment page (Generate QR code, typed code, Print label, Replace code); 100 × 150 mm QR label PDF; Drivers page (add driver with one-time setup code, reset PIN, deactivate, equipment access); driver portal (type a code, scanned-equipment page with Driver PIN / First time / Email login, pre-start, result page with Sign out); the driver portal keeps its own session.
- Browser-checked end to end: QR generated, label downloaded (one page), driver added, first sign-in with setup code and new PIN, 56-item pre-start passed, sign out, wrong PIN refused, PIN sign-in, the owner sees the pre-start under the driver's name. Test data: driver "Test Driver (test)" (D-0001) with access to CAT-ESC-0001, two passed pre-starts.

## 2026-11-10 — Session 2 (continued): pre-start PDF; holds, breakdowns, defect notices, critical alerts
**Done**
- Pre-start PDF on HVEMS letterhead (`/customer/[org]/inspections/[id]/pdf`, react-pdf): logo, company, outcome banner, equipment and readings, faults with notes and photos, full checklist, declaration, footer with page numbers and the records-only notice. "Download PDF" on the record. Rendered and checked.
- Migrations `20261110075018 holds_breakdowns_notices_alerts` and `20261110075608 alerts_auto_acknowledge` (applied by Claude):
  - Holds (Out of service / Needs attention, with a reason); removing an Out-of-service hold leads to Return to service.
  - Breakdowns (anyone who reports defects; Out of service; resolve → Return to service).
  - Regulator defect notices (Major → Out of service; Minor / self-clearing → Needs attention; clearing needs a date and reference).
  - Critical alerts for every Out-of-service event, to Owner and Fleet Managers; Acknowledge on the Alerts page; escalation at 30 minutes (adds Company Admins) and 2 hours (settings `alerts.escalate_*`), run by pg_cron every 5 minutes (extension enabled); alerts acknowledge themselves when their cause is dealt with.
  - pgTAP `090`.
- Web: equipment page panel (Report breakdown, Place hold, Defect notice; remove / mark fixed / clear); Alerts page with critical alerts, escalation badges and Acknowledge; Defects & Safety lists open holds, breakdowns and notices across the fleet.
- Checked: hosted smoke test (rolled back) and in the browser on CAT-ESC-0001 (hold → acknowledged → removed → returned; breakdown → fixed → returned; Minor notice → cleared). The trailer is Active; the test records stay in its history.

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
