# ADR-009 — Five portals, one session per portal

**Status:** Accepted (Ahmad, Omnific IT) · **Date:** 2026-11-09 · **Scope:** spec §2.3, §2.5, §2.7 (D-06), ACC-01, ACC-10, ACC-11/12 · **Extends:** ADR-007

## Context
The Development Specification v2.2 expects separate portals with sessions bound to one audience. Switching between portals uses a single-use handoff token valid for 60 seconds (D-06, confirmed). Ahmad decided that each audience gets its own sign-in:
- the Super Admin console;
- the company portal;
- a driver sign-in for companies;
- the provider portal;
- the marketplace, for marketplace-only customers.

Companies use the marketplace from **inside** the company portal.

## Decision
One Next.js app. `lib/portals.ts` maps the request host to a portal:

| Portal | Env var (dev default) | Serves | Sign-in | Self sign-up |
|---|---|---|---|---|
| Super Admin console | `ADMIN_HOST` (`admin.localhost:3000`) | `/admin`, `/account/security` | Email + password + MFA always | No |
| Company portal | `COMPANY_HOST` (`company.localhost:3000`) | `/customer/*` for **company** orgs, including marketplace job posting | Email + password | Yes (company) |
| Marketplace | `MARKET_HOST` (`market.localhost:3000`) | `/customer/*` for **marketplace-only** orgs | Email + password | Yes (marketplace-only) |
| Provider portal | `PROVIDER_HOST` (`provider.localhost:3000`) | `/provider/*` | Email + password | Yes (provider) |
| Driver sign-in | `DRIVER_HOST` (`driver.localhost:3000`) | `/driver` only | Equipment code + Driver ID + PIN (built in 2B) | No |

**How each part is enforced**
- **Routing:** `proxy.ts` serves only the current portal's routes plus the shared auth routes, and returns 404 for anything else. Unknown hosts get 404; in development, plain `localhost` redirects to the company portal.
- **Organisation in the URL:** `loadOrgContext` returns 404 when the organisation's kind isn't served by the current portal. A company org can't be opened on the marketplace host, even by its own Owner.
- **Sessions:** Supabase auth cookies are host-only, so each portal has its own session. Signing out of one portal doesn't sign the person out of the others.
- **Switching portals:**
  1. `GET /auth/handoff/start?to=…` on the current portal issues a Supabase magic-link token hash for the signed-in person (service key, server-only).
  2. That hash is wrapped in an HMAC-signed envelope bound to the person and the target portal, expiring after 60 seconds (`lib/handoff.ts`).
  3. `GET /auth/handoff` on the target portal verifies the envelope and redeems the single-use token, which creates that portal's own session.
  4. Both steps write `security_events`.
  5. A handoff session starts at `aal1`, so portal MFA rules still apply.
- **Prefetching:** handoff links are never prefetched.
- **Account types:** onboarding creates only the current portal's organisation kind (checked server-side). Email links (verification, reset, invitations) use the current portal's origin.

## Consequences
- **Addresses (decided 12 Nov 2026):** the HVEMS website stays on `hvems.com.au`. Production: company `portal.hvems.com.au`, provider `provider.hvems.com.au`, operator `operator.hvems.com.au` (printed on QR labels), Super Admin `admin.hvems.com.au`, marketplace `market.hvems.com.au` (reserved for 2D). Development: the same with a `dev-` prefix (`dev-portal.hvems.com.au` …). See docs/operations/hosting.md.
- **Deployment:** one deployment with five hostnames. Every host's `/auth/callback**` must be in the Supabase Auth redirect allow-list (email verification, password reset). The trailing `**` matters: the links carry `?next=…`, and an exact entry without it is rejected (checked 9 Nov 2026). The handoff doesn't use Supabase redirects.
- **Secrets:** the service (secret) key is now required at runtime for handoffs. `PORTAL_HANDOFF_SECRET` is optional; without it a signing key is derived from the service key.
- **Drivers:** the portal exists now, with a non-functional notice. PIN sessions arrive with driver profiles in 2B (short-lived token limited to permitted assets, not a Supabase user).
- **Later:** if HVEMS wants physically separate apps, the route groups can split without schema changes.
