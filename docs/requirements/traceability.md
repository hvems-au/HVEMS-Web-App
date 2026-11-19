# Requirements traceability — CS-01 to CS-45

Source: HVEMS Client Scope of Work v2.2, Appendix A. Status: ✅ done in 2A · 🟡 foundation laid (2A) and completed later · ⏳ planned · ➖ not Stage 2.
Evidence paths are relative to the repository root. "pgTAP" = `supabase/tests/*.test.sql`; "Vitest" 🟡 | In-house/vendor work orders, start/complete/close/reopen/cancel, allocation warnings (pgTAP 250, 270); "post to marketplace" comes with 2D || Service plans by days/km/hours, schedule with Overdue/Due soon, overdue rule (pgTAP 250); calendar view to do || Breakdowns and regulator notices with holds and alerts (2B) || Frequency per type/equipment incl. custom days; missed pre-starts detected hourly, reviewed and audited (pgTAP 240, 260); inspection filters || Pre-start forms by equipment type, safety-equipment checks, operator/manager submission, results and PDFs ✅; checklist editor waits for the HVEMS checklist review (P-01) |`packages/*/src/*.test.ts`.

| ID | Scope item | Stage / increment | Status | Evidence / notes |
|---|---|---|---|---|
| CS-01 | Customer Portal: company organisations, members, roles and grants | 2 / 2A | ✅ | identity migration; Team page; pgTAP 010 (roles, grants, competency note, eligibility, invitations, 5-login limit) |
| CS-02 | Marketplace-only customer accounts | 2 / 2A (+2D jobs) | 🟡 | Account type, Account Owner/Job Manager roles, onboarding, dashboard; jobs in 2D |
| CS-03 | Provider Portal: provider accounts and teams | 2 / 2A (+2D) | 🟡 | Provider account with ABN, Owner/Manager/Technician, Team page; profile, verification and work in 2D |
| CS-04 | HVEMS administration console | 2 / 2A (+2D) | 🟡 | Separate host (ADR-007), staff + MFA, support access RPCs, org list, settings view; verification, cases, billing, moderation in 2D |
| CS-05 | Sign-in, security, more than one portal or company | 2 / 2A | ✅ | Auth pages, TOTP MFA, MFA rule §2.5 (DB + UI), context switcher; account closure in 2D |
| CS-06 | Privacy between organisations; engagement record | 2 / 2A (+2D) | 🟡 | RLS + composite FKs + pgTAP isolation tests; engagement copy-on-confirm in 2D |
| CS-07 | Equipment register, asset categories, clients and sites | 2 / 2A | ✅ | fleet migration; Equipment and Clients & Sites pages; pgTAP 020 |
| CS-08 | Meter readings, asset page, archiving and sale | 2 / 2A (+2C) | 🟡 | Meter rules, amendments, archive/sale ✅; service history pack PDF in 2C; acceptance queue UI 2B |
| CS-09 | Asset import; conversion of marketplace-only customers | 2 / 2A (+2D) | 🟡 | `import_assets()` + wizard ✅; conversion in 2D |
| CS-10 | Driver access, driver profiles, equipment codes | 2 / 2B | 🟡 | Permitted operators (`asset_operator_permissions`) and driver role ✅; profiles, PIN, codes/QR in 2B (domain rules tested) |
| CS-11 | Pre-start, inspection, condition and vehicle forms; templates | 2 / 2B | ⏳ | — |
| CS-12 | Inspection frequency, missed inspections, review, amendments | 2 / 2B | ⏳ | — |
| CS-13 | Defects, severity rules, triage, holds, deferral | 2 / 2B | 🟡 | Severity/deferral rules in `@hvems/domain/safety` (Vitest); hold causes in engine |
| CS-14 | Asset condition | 2 / 2A–2B | ✅ engine | Condition engine, history, column lock, API lock (pgTAP 020); defect UI 2B |
| CS-15 | Authorised clearance (two steps) | 2 / 2B | 🟡 | Awaiting-RTS cause and `can_return_to_service` (pgTAP); Clearance Authority grant ✅ |
| CS-16 | Breakdowns and regulator defect notices | 2 / 2B | ⏳ | — |
| CS-17 | Maintenance scheduling | 2 / 2C | ⏳ | overdue-service rule switch ✅ |
| CS-18 | Work orders | 2 / 2C | ⏳ | — |
| CS-19 | Workforce allocation and availability | 2 / 2C | ✅ | Profiles (trade, availability), qualifications with expiry alerts, leave; allocation warnings recorded on work orders (pgTAP 270) |
| CS-20 | Parts requests, approvals, purchasing, receiving, usage | 2 / 2C | ✅ | PRT-01..07: multi-line requests (equipment / work order, urgency, needed by, delivery site, photos), one approval level by Approval Limit (auto within limit, routed otherwise, reject with reason), orders with 10% re-approval, partial receiving, substitutes and returns, fitting to work orders (from deliveries or bought on the spot) with one cost line per fit and reversing returns; supplier list and catalogue; technicians never see prices or cost lines (pgTAP 330) |
| CS-21 | Inventory and purchase order documents | 4 | ➖ | Anticipated in schema design only |
| CS-22 | Documents and files | 2 / 2C | 🟡 | DOC-01/03/04/05: private `documents` bucket per equipment, nine categories, expiry with reminders at 30 and 7 days (daily job), 5-minute links, replace or retire with a reason (never deleted), Documents page with expiry filters (pgTAP 340). Malware scanning (DOC-02) waits on a scanning-service decision (P-07) |
| CS-23 | Expenditure, fuel and usage | 2 / 2C | ✅ | EXP-01..03: fuel records (equipment, date and time, quantity and unit, fuel type, odometer / hour meter reading recorded on the equipment with the lower-reading reason, supplier, receipt photos, notes; corrections by amendment with a reason, cost reversed); append-only cost lines from parts fitted, fuel, and on closing a work order its labour (hours × technician cost rate) and other costs, reversed on reopen; Costs page with totals by type, equipment, work order and client; technician cost rates readable only by cost readers (pgTAP 350) |
| CS-24 | Dashboards, reports, compliance summary, exports | 2 / 2A–2C | 🟡 | Company/provider/console dashboards from live data ✅; 15 reports, PDFs, export in 2C |
| CS-25 | Audit history | 2 / 2A | ✅ | Append-only `audit_events` (immutable even for owner), actor + identification method, redaction, viewer; pgTAP 010 |
| CS-26 | Marketplace job posting | 2 / 2D | ⏳ | Marketplace Buyer grant and capability ✅ |
| CS-27 | Provider profiles, availability, verification | 2 / 2D | ⏳ | ABN checksum (DB + TS) ✅ |
| CS-28 | Questions, proposals, messages | 2 / 2D | ⏳ | — |
| CS-29 | Acceptance and engagement confirmation | 2 / 2D | ⏳ | Design: ADR-006 (approval needed) |
| CS-30 | Urgent jobs | 2 / 2D | ⏳ | Time windows seeded as settings |
| CS-31 | Engagement work, completion, variations, reviews, follow-up | 2 / 2D | ⏳ | Follow-up fee exemption in domain (Vitest) |
| CS-32 | Cancellations, no-shows, reassignment, cases | 2 / 2D | ⏳ | — |
| CS-33 | Marketplace regions | 2 / 2D | ⏳ | — |
| CS-34 | Fleet subscription | 2 / 2A (+2D) | 🟡 | Formula, highest-count, introductory month (Vitest); consent guard, asset-count history, introductory-month marker (pgTAP); invoicing 2D |
| CS-35 | Provider subscription | 2 / 2D | 🟡 | Price + founding-provider rule (Vitest) |
| CS-36 | Connection fees | 2 / 2D | 🟡 | Fee rules (Vitest); payment design ADR-006 |
| CS-37 | Monthly company waivers | 2 / 2D | 🟡 | Allowance, 14-day qualification, top-up, restoration (Vitest) |
| CS-38 | Fee refunds, failed payments, restrictions | 2 / 2D | 🟡 | `restricted` status blocks assets/members (DB) |
| CS-39 | Invoices, GST and the payment provider | 2 / 2D | 🟡 | GST one-eleventh rule (Vitest); settings |
| CS-40 | Email and in-app notifications; push with apps | 2, 3 | ⏳ | — |
| CS-41 | Mobile applications with offline capture | 3 | ➖ | Readiness: `docs/mobile-readiness` |
| CS-42 | Handwritten-form reading | 4 | ➖ | — |
| CS-43 | Pilot support | 5 | ➖ | — |
| CS-44 | Quality, security and hosting targets | All | 🟡 | ADR-002 (approval), security headers, RLS, MFA; performance and pen tests later |
| CS-45 | Testing, training, documentation, handover | All | 🟡 | pgTAP + Vitest + typecheck + build; docs in `docs/` |
