# Figma design analysis — HVEMS Web App (Copy)

**Source:** https://www.figma.com/design/7avSLLNRbCjh8iZxKKJYbM/HVEMS-Web-App--Copy- (page `0:1`, inspected 9 Nov 2026 via the Figma MCP integration, account `ahmad.khattak@omnificdevelopers.com`).
**Method:** full page metadata (117 top-level frames), variable definitions, design context for the login frame, and screenshots of representative frames (company dashboard, equipment, login, super-admin dashboard, provider browse jobs, driver dashboard).
**Limitation:** this environment cannot download Figma image assets (`www.figma.com` is outside the network allowlist). The HVEMS logo was taken from the supplied `HVEMS_Logo.pdf` instead; equipment photos in Figma are illustrative and not used.

The Scope of Work decides **what** must exist; Figma guides **how it looks**.

## 1. Design language (implemented in `packages/ui/src/tokens.ts` and `apps/web/app/globals.css`)

| Token | Value | Figma variable |
|---|---|---|
| Brand / primary | `#CE5502` | Logo Color |
| Sidebar / dark panels | `#0B0B0B` | Shade |
| Page background | `#F8F8F8` | Background |
| Strokes | `#D9D9D9` | Stroke |
| Headings (muted) | `#5B5C5D` | Dark Grey |
| Secondary text | `#A7A6AB` | Text Grey |
| Body text | `#090D11` | Text Dark |
| Link / info | `#2071DD` | Blue |
| Success | `#0EA400` | Green |
| Danger | `#F11617` / `#FFE2E2` | Red / Red Box |
| Warning surface | `#FFF5E0` | Light Yellow |
| Progress accent | `#F8781F` | Progress |

Typography is **Inter** (Regular/Medium/Semi Bold/Bold). Layout: 180 px black sidebar with the stacked logo, white nav text and an orange filled active item; organisation/user card at the bottom; page title 24–26 px bold dark grey with a grey subtitle; white KPI cards with a soft shadow; tables with a light-grey header row; status pills (green/amber/red/grey); inputs 48 px high with 6 px radius; primary buttons orange, 6 px radius; auth screens split 52/48 with a black brand panel.

## 2. Frame inventory

| Group | Frames |
|---|---|
| Customer Portal — Company organisation | 47 |
| Driver / Operator | 6 |
| Internal Technician | 17 |
| Customer Portal — Job Poster (marketplace-only customer) | 12 |
| Provider Portal — Provider Company | 15 |
| Provider Portal — Individual Provider | 3 |
| HVEMS administration console (Super Admin) | 15 |
| Other | 2 |
| **Total** | **117** |

### Customer Portal — Company organisation (47)

| Node | Frame | Size |
|---|---|---|
| `1065:560` | Company - Sign Up | 1440×960 |
| `1064:43` | Company - Subscription & Payment | 1440×960 |
| `1082:555` | Company - Account Pending Approval | 1440×960 |
| `1083:823` | Company - Account Rejected | 1440×960 |
| `1068:1019` | Company - Account Activated | 1440×960 |
| `944:50` | Company - Login | 1440×960 |
| `1075:193` | Company - Forgot Password | 1440×960 |
| `1:2` | Company - Dashboard | 1440×960 |
| `238:20` | Company - Jobs / Word Orders | 1440×960 |
| `277:622` | Company - Job Detail Popup | 1440×1000 |
| `305:3965` | Company - Create Job Popup | 1440×960 |
| `508:240` | Company - Add Part Popup | 1440×960 |
| `241:10` | Company - Equipment | 1440×960 |
| `589:8398` | Company - Equipment Details | 1440×960 |
| `589:8773` | Company - Add Equipment Popup | 1440×960 |
| `54:718` | Company - Maintenance | 1440×1115 |
| `233:38` | Company - Inspections | 1440×2184 |
| `291:774` | Company - New Inspection Popup | 1440×2184 |
| `298:2233` | Company - Create Checklist Popup | 1440×2184 |
| `255:182` | Company - Service Schedule | 1440×2028 |
| `257:880` | Company - Technicians | 1440×1320 |
| `397:3521` | Company - Technicians Details | 1440×1320 |
| `397:5090` | Company - Add Technician Popup | 1440×1320 |
| `302:3276` | Company - Clients | 1440×1089 |
| `397:1924` | Company - Clients Detail Popup | 1440×1089 |
| `397:2273` | Company - Add Client Popup | 1440×1089 |
| `336:152` | Company - Parts & Inventory | 1440×2025 |
| `397:5749` | Company - Add Part popup | 1440×2025 |
| `459:3` | Company - Usage & Meter | 1440×1797 |
| `461:268` | Company - Documents | 1440×1797 |
| `461:1109` | Company - Add Documents | 1440×1797 |
| `473:2` | Company - Alerts | 1440×1089 |
| `476:510` | Company - Notifictions | 1440×1206 |
| `480:13` | Company - Settings | 1440×1089 |
| `482:1436` | Company - Settings Details | 1440×1089 |
| `774:2000` | Company - Marketplace | 1440×1560 |
| `775:3566` | Company Marketplace - My Posted Jobs | 1440×1560 |
| `803:2` | Company Marketplace - Post Job | 1440×1066 |
| `1150:3854` | Company Marketplace - Proposal Received | 1440×1066 |
| `775:3968` | Company Marketplace - Active Contracts | 1440×1560 |
| `775:4926` | Company Marketplace - Inbox | 1440×1066 |
| `445:12` | Company - Reports & Analytics | 1440×1415 |
| `1120:137` | Equipment | 1440×960 |
| `1071:1374` | Company - Help & Support | 1440×1089 |
| `1073:1844` | Company - Help & Support Create Ticket | 1440×1089 |
| `1074:2280` | Company - Help & Support Open Ticket | 1440×1089 |
| `1074:3324` | Company - Help & Support Resolve Ticket | 1440×1089 |

### Driver / Operator (6)

| Node | Frame | Size |
|---|---|---|
| `896:151` | Driver Pre-Start CHecklist | 1440×981 |
| `967:589` | Driver Pre-Start CHecklist | 1440×981 |
| `972:13` | Driver Notifications | 1440×981 |
| `1012:258` | Driver Login | 1440×981 |
| `958:2` | Driver Dashboard | 1440×981 |
| `964:287` | Driver Equipment | 1440×981 |

### Internal Technician (17)

| Node | Frame | Size |
|---|---|---|
| `482:836` | Technician Dashboard | 1440×1115 |
| `579:22` | Technician Jobs | 1440×960 |
| `586:1679` | Technician Jobs Detail Popup | 1440×960 |
| `586:2411` | Technician Equipment | 1440×960 |
| `586:3305` | Technician Equipment Detail Popup | 1440×960 |
| `586:4710` | Technician Maintenance | 1440×1115 |
| `586:5281` | Technician Inspections | 1440×1645 |
| `589:6460` | Technician Create Inspections Popup | 1440×1645 |
| `589:7694` | Technician Service Schedule | 1440×2028 |
| `589:9757` | Technicians Parts & Inventory | 1440×1526 |
| `617:174` | Technicians Reports & Analytics | 1440×1415 |
| `621:1287` | Technicians Documents | 1440×1369 |
| `621:539` | Technicians Alerts | 1440×1089 |
| `621:889` | Technician Notifictions | 1440×1206 |
| `1128:1413` | Internal Technician - Help & Support | 1440×1089 |
| `1130:2003` | Internal Technician - Help & Support Create Ticket | 1440×1089 |
| `1136:2485` | Internal Technician - Help & Support Open Ticket | 1440×1089 |

### Customer Portal — Job Poster (marketplace-only customer) (12)

| Node | Frame | Size |
|---|---|---|
| `1088:1858` | Job Poster - Sign Up | 1440×960 |
| `1088:2060` | Job Poster - Login | 1440×960 |
| `1088:2326` | Job Poster - Dashboard | 1440×960 |
| `1136:3010` | Job Poster - Post a Job | 1440×960 |
| `1136:3429` | Job Poster - My Posted Jobs | 1440×1212 |
| `1139:4030` | Job Poster - Bids & Proposals | 1440×1212 |
| `1139:4634` | Job Poster - Active Contracts | 1440×1212 |
| `1139:5245` | Job Poster - Inbox | 1440×1037 |
| `1139:5755` | Job Poster - Notifications | 1440×1037 |
| `1139:6190` | Job Poster - My Profile | 1440×1037 |
| `1139:6694` | Job Poster - Settings | 1440×1037 |
| `1140:7114` | Job Poster - Help & Support | 1440×1037 |

### Provider Portal — Provider Company (15)

| Node | Frame | Size |
|---|---|---|
| `1043:27` | Provider Company - Sign Up | 1440×960 |
| `944:386` | Provider Company - Login | 1440×960 |
| `774:704` | Provider Company - Logout | 1440×1571 |
| `710:763` | Provider Company - Browse Jobs | 1440×1571 |
| `715:1114` | Provider Company - Job Detail | 1440×1195 |
| `731:936` | Provider Company - Browse Job Category | 1440×1571 |
| `732:1272` | Provider Company - Saved Jobs | 1440×1490 |
| `736:1648` | Provider Company - My Proposals | 1440×1583 |
| `872:5247` | Provider Company - Post a Job | 1440×1066 |
| `736:2707` | Provider Company - My Posted Jobs | 1440×1697 |
| `737:3056` | Provider Company - Active Contracts | 1440×1697 |
| `741:3423` | Provider Company - Inbox | 1440×1037 |
| `770:61` | Provider Company - Notifications | 1440×1037 |
| `925:19` | Provider Company - Profile | 1440×1037 |
| `1018:1043` | Provider Company - Settings | 1440×1037 |

### Provider Portal — Individual Provider (3)

| Node | Frame | Size |
|---|---|---|
| `1089:3499` | Provider Indidual- Sign Up | 1440×960 |
| `1089:3303` | Provider Indidual- Login | 1440×960 |
| `1122:875` | Provider Indidual - Browse Jobs | 1440×1571 |

### HVEMS administration console (Super Admin) (15)

| Node | Frame | Size |
|---|---|---|
| `943:1941` | Super Admin Login | 1440×960 |
| `932:2` | Super Admin - Dashboard | 1440×1045 |
| `1144:294` | Super Admin - Team Management | 1440×960 |
| `1149:1243` | Super Admin - Team Management - Add Team Member Popup | 1440×960 |
| `1149:805` | Super Admin - Team Management - Roles Tab | 1440×960 |
| `1150:2242` | Super Admin - Team Management - Roles Tab - Create New Role | 1440×960 |
| `1150:3012` | Super Admin - Support & Helpdesk | 1440×960 |
| `1150:3452` | Super Admin - Internal Tasks | 1440×960 |
| `1149:1631` | Super Admin - Team Management - Roles Tab | 1440×960 |
| `1084:1528` | Super Admin -Pending Approvals List | 1440×960 |
| `1088:1285` | Super Admin - Pending Approvals Company Detail | 1440×960 |
| `933:638` | Super Admin Companies | 1440×960 |
| `938:1415` | Super Admin Company Details | 1440×1109 |
| `1019:943` | Super Admin Company Details. Subscription Tab | 1440×1109 |
| `1142:7853` | Super Admin - Marketplace Management | 1440×1109 |

### Other (2)

| Node | Frame | Size |
|---|---|---|
| `944:219` | Internal Techncian Login | 1440×960 |
| `589:7082` | Technian Checklist | 1440×1645 |

## 3. Conflicts between Figma and the Scope of Work

Each item below is shown in Figma but conflicts with a Confirmed scope decision or exclusion. The build follows the Scope of Work; these need a design update or a change request.

| # | Figma | Scope of Work | Treatment in build | Needs |
|---|---|---|---|---|
| F-01 | Super Admin "Roles Tab", "Create New Role" | §11.3 excludes **custom roles**; staff roles are fixed (Platform Administrator, Support Agent + Verification Officer / Billing Approver authorities) | Fixed roles and authorities only | Design update |
| F-02 | Map widgets ("Jobs by Location", "Top Locations") | §11.3 excludes **map displays** | Location lists without maps | Design update |
| F-03 | Equipment statuses *Active / In Maintenance / Completed / Out of Service / Retired* | §3.4: one condition — **Active, Needs attention, Broken/Out of service** — set automatically; service status (Up to date/Due soon/Overdue/Unknown) shown separately; archived assets are not a condition | Condition + separate service status + Archived tab | Design update |
| F-04 | Company sign-up → "Account Pending Approval / Rejected / Activated"; Super Admin "Pending Approvals" for companies | Not in scope: company and marketplace-only accounts are self-serve. HVEMS approval applies to **provider verification** only (§4.3) | Self-serve onboarding; approvals reserved for providers (2D) | HVEMS decision (an approval gate would be a variation) |
| F-05 | "Company – Subscription & Payment" during sign-up | §5.2: first five assets free; payment method and consent required only before the **sixth** asset (and before the first paid marketplace acceptance) | No payment at sign-up; consent gate at the sixth asset | Design update |
| F-06 | Provider Company "Post a Job", "My Posted Jobs" | §4.1: job posters are company organisations or marketplace-only customers | Not built in the Provider Portal; providers needing work done use a customer account | HVEMS decision |
| F-07 | "Parts & Inventory" (stock levels) | Stock inventory and purchase orders are **Stage 4** (CS-21); Stage 2 covers parts requests → usage (CS-20) | Stage 2 parts workflow only | Design split |
| F-08 | Help & Support ticket threads (create/open/resolve) | §11.2: helpdesk is HVEMS's chosen third-party product fed by a contact form; in-app ticketing not in scope | Contact link to support; "Cases" (marketplace disputes) built in 2D | HVEMS decision |
| F-09 | Super Admin "Internal Tasks", "Announcements" | Not in scope | Not built | Change request if wanted |
| F-10 | Technician "Reports & Analytics", "Parts & Inventory" with prices | §3.6: technicians **never see costs, rates or the marketplace** | Technician views without costs | Design update |
| F-11 | Sample data "BHP Mining", Perth/WA locations, footer "2026 JTDM" | §12.4: demonstration data uses fictional names only; HVEMS operates from Moreton Bay, QLD | Fictional names, QLD defaults, "© HVEMS" footer | Design tidy-up |
| F-12 | Separate "Provider Company" and "Provider Individual" sign-ups | One provider account type with Provider Owner/Manager/Technician roles (§2.2) | Single provider sign-up; sole traders are a one-person provider account | Design simplification |

## 4. Screens required by the Scope of Work but missing from Figma

Designed in code using the established component system (status: ✅ built in 2A · ⏳ planned increment).

| Area | Missing screen / state | Scope | Status |
|---|---|---|---|
| Accounts | Account-type onboarding (company / marketplace-only / provider) | CS-01–03 | ✅ |
| Accounts | Email verification "check your email", set new password | CS-05 | ✅ |
| Accounts | MFA enrolment (authenticator app) and sign-in challenge | CS-05 | ✅ |
| Accounts | Organisation and portal switcher; "choose where to work" | CS-05, D-06 | ✅ |
| Accounts | Invitation acceptance | CS-01 | ✅ |
| Accounts | Account closure, deactivation, full data export | CS-05, CS-24 | ⏳ 2D |
| Company | Team: roles, grants (Clearance Authority with competency note, Approval Limit, Marketplace Buyer), invitations, member-login limit | CS-01 | ✅ |
| Company | Audit history viewer | CS-25 | ✅ |
| Company | Company safety rules (overdue-service rule, repairer-can't-clear rule) | CS-14/15 | ✅ |
| Company | Sixth-asset fleet-subscription consent (price shown, payment method) | CS-34 | ✅ guard · ⏳ UI with Stripe (2D) |
| Fleet | CSV import with trial run and per-row errors | CS-09 | ✅ |
| Fleet | Archive / sale with reason, effective date and open-issue acknowledgement | CS-08 | ✅ |
| Fleet | Meter readings: lower-reading reason, jump confirmation, manager acceptance, amendments, history | CS-08 | ✅ (acceptance queue UI ⏳ 2B) |
| Fleet | Condition history on the asset page | CS-14 | ✅ |
| Fleet | Marketplace-only customer → company conversion | CS-09 | ⏳ 2D |
| Safety | Driver profiles, Driver ID + PIN setup codes, lockout reset | CS-10 | ⏳ 2B |
| Safety | Public equipment-code page (QR/typed), identify, pre-start flow, result screen ("Do not operate"), unverified problem report | CS-10/11 | ⏳ 2B |
| Safety | QR label printing and code reissue | CS-10 | ⏳ 2B |
| Safety | Template editor (copy, sections, field types, item rules), publishing versions, assignment and frequency | CS-11/12 | ⏳ 2B |
| Safety | Inspection review, missed inspections, amendments, "not in use today" | CS-12 | ⏳ 2B |
| Safety | Defect register and detail; triage (merge, dismiss, link, defer); holds | CS-13 | ⏳ 2B |
| Safety | Two-step clearance (defect clearance with evidence; return-to-service declaration) | CS-15 | ⏳ 2B |
| Safety | Breakdown report ("Call 000 first") → Critical defect + urgent work order + alert | CS-16 | ⏳ 2B |
| Safety | Critical alert acknowledgement and escalation; regulator defect notices | CS-16, CS-40 | ⏳ 2B |
| Maintenance | Service plan editor, calendar view, reschedule/skip with reason | CS-17 | ⏳ 2C |
| Maintenance | Work order review/return/close/reopen, partial completion + follow-up, allocation warnings | CS-18/19 | ⏳ 2C |
| Maintenance | Leave and availability; qualification expiry | CS-19 | ⏳ 2C |
| Maintenance | Parts request lines, approval by limit, purchasing, receiving (partial), returns | CS-20 | ⏳ 2C |
| Maintenance | Expenditure, fuel records, document expiry | CS-22/23 | ⏳ 2C |
| Reports | The 15 CSV reports, compliance summary, printable PDFs, full export | CS-24 | ⏳ 2C |
| Marketplace | Posting review step showing provider view and fee/waiver notice | CS-26 | ⏳ 2D |
| Marketplace | Proposal comparison incl. conflict-of-interest flag; acceptance summary; "Acceptance pending fees" | CS-28/29 | ⏳ 2D |
| Marketplace | Urgent flow: arrival times, "On my way", no-proposal prompt after 30 min, "Call 000" | CS-30 | ⏳ 2D |
| Marketplace | Engagement workspace: variations, completion report, confirm/correct, reviews and replies | CS-31 | ⏳ 2D |
| Marketplace | Cancellation, no-show, reassignment, cases | CS-32 | ⏳ 2D |
| Provider | Verification submission and status, badges, insurance expiry | CS-27 | ⏳ 2D |
| Billing | Subscriptions, invoices, payment methods, waiver balance | CS-34–39 | ⏳ 2D |
| Console | Verification queue, cases, refunds with second approval > $500, waiver adjustments, settings editing, support-access sessions, rolling 12-month revenue | CS-04 | Org list + settings view ✅ · rest ⏳ 2D |
| Notifications | Notification list, unread count, preferences | CS-40 | ⏳ 2D |
