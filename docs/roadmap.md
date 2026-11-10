# Stage 2 implementation roadmap

Order follows SoW §9.1 increments. Each increment ends with: migrations + pgTAP tests, UI, Playwright workflows, demo on staging, release notes.

| Increment | Content | Status |
|---|---|---|
| **Stage 1** | SoW + Figma analysis, architecture review, ADRs, traceability, approvals list | ✅ draft for approval (this repo) |
| **2A Foundations** | Accounts, MFA, three account types, roles/grants, invitations, staff and support access, equipment register, clients/sites, import, meter readings, archiving, condition engine, consent guard, audit history, portal shells | ✅ built and tested locally · ⏳ apply to hosted project (AP-1) and run E2E |
| **2B Safety** | Driver profiles + PIN + lockout; equipment codes and QR labels; public equipment-code page; inspection templates (copy, sections, field types, item rules, versions, assignment, frequency); pre-start flow; missed inspections and review; defects, triage, merge, dismiss, deferral; holds; two-step clearance; breakdowns; unverified reports; regulator notices; critical alerts with acknowledgement and 30 min / 2 h escalation (pg_cron); notification outbox | Next |
| **2C Maintenance** | Service plans (date/km/hours, due-soon, projections); schedule list and calendar; work orders (internal / named vendor / marketplace), allocation warnings, exceptions, review/close/reopen; workforce profiles, qualifications, leave; parts requests → approval → purchasing → receiving → usage; documents (private Storage, malware check, expiry); expenditure and fuel; dashboards; 15 CSV reports; compliance summary; PDFs; full export | Planned |
| **2D Marketplace & billing** | Provider profile and verification (manual ABN check by a Verification Officer; no ABN Lookup integration); job posting and visibility; questions; proposals and revisions; acceptance with dual authorisation (ADR-006); engagements, variations, completion, reviews, follow-ups; cancellations, no-shows, reassignment, strikes, cases; regions; Stripe customers, SetupIntents, subscriptions, invoices, webhooks, ledger, reconciliation; waivers; restrictions; email + in-app notifications and preferences; console (verification, cases, refunds with second approval, waiver adjustments, settings editing, moderation, support access UI, revenue for GST threshold) | Planned |
| **Stage 2 completion** | Full regression, Stripe test-mode payment matrix, cross-tenant suite on staging, performance test (200 users, 20k assets, 500k records), WCAG 2.2 AA checks on critical journeys, release notes, rollback rehearsal | Planned |

## Pending decisions and arrangements

| # | Item | Owner | Blocks |
|---|---|---|---|
| P-01 | **Standard inspection and pre-start checklists.** Draft: `docs/design/prestart-checklists-draft.md` (auto-filled header incl. equipment ID, rego, make, model, last odometer/hours; generic + safety sections for all heavy machinery; class sections; notes and photos). Proposal: one HVEMS standard checklist per standard asset class, add-on sections (tipper, crane/lifting, quick hitch, air brakes, coupling, attachments…) and company additions for make/model items from the operator's manual. Not per make and model (manufacturer copyright, liability, thousands of models). No copying of third-party checklist products. Needs discussion and approval, then review by a competent person at HVEMS before release | HVEMS (Jaimie) + Ahmad | Pre-start flow in 2B. The **Pre-start** button on the equipment page is shown disabled ("Coming soon") until then |
| P-02 | Email provider (custom SMTP for Supabase Auth and the notification outbox) | Ahmad | Email delivery of invitations and critical alerts (in-app alerts work without it) |
| P-03 | Supabase Pro, backups (AP-3), leaked-password protection, separate production project | Ahmad | Go-live |
| P-04 | Production domains for the five portal hosts | Ahmad / HVEMS | Go-live; Supabase redirect URLs |
| P-05 | A second Super Admin account | Ahmad | Recovery if the only Super Admin loses MFA |
| P-06 | Switch-on date for MFA for every user (O-06) | HVEMS | Nothing; it's a setting |
