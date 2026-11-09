# ADR-007 — Administration console on a separate address

**Status:** Accepted (Omnific IT), extended by ADR-009 (five portals) · **Date:** 2026-11-09 · **Scope:** CS-04, SoW §2.3

## Decision
The console is part of the same Next.js app but is only served on `ADMIN_HOST` (e.g. `admin.hvems.com.au`). `proxy.ts` returns 404 for `/admin` on any other host, and redirects non-admin paths on the admin host to `/admin`. The admin layout also requires a `platform_staff` record and an `aal2` session, and every staff RLS policy requires `aal2`, so the host rule is not the only control.

## Consequences
- One deployment, one codebase; the console's address can sit behind extra controls (IP allow-list, WAF rules) without affecting customers.
- If HVEMS later wants complete separation, `app/admin` can move to its own app without schema changes.
