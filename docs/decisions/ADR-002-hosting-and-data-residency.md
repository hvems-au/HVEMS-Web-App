# ADR-002 — Hosting, data residency and backups

**Status:** Proposed — **requires HVEMS approval (SoW A-05)** · **Date:** 2026-11-09

## Context
SoW §12.1 targets databases, files and backups in Australia (AWS Sydney), 99.5% availability, daily backups plus point-in-time recovery kept 35 days, RPO ≤ 1 hour, recovery within 8 business hours, restores tested before launch and quarterly. The development brief selects Supabase. The project `anvqykllajezwaasguqp` exists in **ap-southeast-2 (Sydney)** on the **Free** plan.

## Verified facts (Supabase documentation, Nov 2026)
- A project's Postgres database, Auth service and Storage objects are hosted in its region; backups are stored in the same region.
- Daily backups: Pro 7 days, Team 14 days, Enterprise up to 30 days. Free: none.
- PITR add-on: retention 7, 14 or 28 days (about US$100, 200 or 400 per month); WAL shipped about every 2 minutes, so worst-case RPO is about 2 minutes.
- Edge Functions execute nearest the caller unless invoked with a region (`x-region` / `FunctionRegion.ApSoutheast2`).
- The Storage CDN cache is global; private, signed-URL objects should not be cached publicly.

## Decision (proposed)
| Component | Choice | Residency |
|---|---|---|
| Database, Auth, Storage | Supabase Pro, ap-southeast-2 | Australia |
| Point-in-time recovery | 28-day PITR add-on | Australia (same region) |
| Gap to the 35-day target | Nightly encrypted `pg_dump` + Storage sync to an **HVEMS-owned** S3 bucket in ap-southeast-2 with a 35-day lifecycle (GitHub Actions or AWS scheduled task) | Australia |
| Edge Functions | Always invoked with region `ap-southeast-2` | Australia |
| Web app | Vercel, serverless functions pinned to `syd1`; static assets on the global CDN (no personal data) | Australia for compute |
| Payments | Stripe (card data held by Stripe; processing outside Australia) | Disclosed sub-processor |
| Email | Provider able to send from AU (e.g. Amazon SES ap-southeast-2) | Australia |
| Error monitoring | Sentry or equivalent with PII scrubbing; region per HVEMS's choice | Disclosed sub-processor |

Alternatives: (a) HVEMS accepts 28 days instead of 35; (b) Supabase Enterprise (30-day daily backups; contract negotiation); (c) self-managed Postgres on AWS RDS Sydney, which meets the SoW literally but loses Supabase Auth/Storage/Realtime and increases operational cost.

## Indicative running cost (pilot scale, to be confirmed in the Stage 1 record)
Supabase Pro ~US$25/month + compute add-on as needed + PITR 28 days ~US$400/month; Vercel Pro ~US$20 per member/month; S3 backup storage under US$10/month at pilot scale; email and monitoring low. This sits below the SoW's AUD 1,000–2,500/month AWS estimate, but HVEMS must approve the change of provider.

## Consequences
- Until approved, the Free plan has **no backups**: no real customer data may be loaded.
- Restore drills (SoW §12.4) are scripted in the operations runbook before staging.
