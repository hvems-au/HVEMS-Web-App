# Hosting: development and production

The HVEMS website stays on `hvems.com.au`. The app runs on Vercel (Sydney) as two separate sites, so the client only sees what we release to production.

| | Development | Production |
|---|---|---|
| Purpose | Omnific IT testing, previews of work in progress | What HVEMS and its customers use |
| Git branch | `develop` (every push deploys) | `main` (merge from `develop` when a release is ready) |
| Supabase | current project `anvqykllajezwaasguqp` ("HVEMS APP", becomes staging) | new project in the HVEMS org: Pro plan, ap-southeast-2, **not** connected to the Claude connector |
| Data | test companies and users | real data only |

## Addresses (ADR-009, decided 12 Nov 2026)
| Portal | Production | Development | Setting |
|---|---|---|---|
| Company | `portal.hvems.com.au` | `dev-portal.hvems.com.au` | `COMPANY_HOST` |
| Provider | `provider.hvems.com.au` | `dev-provider.hvems.com.au` | `PROVIDER_HOST` |
| Operator (printed on QR labels) | `operator.hvems.com.au` | `dev-operator.hvems.com.au` | `DRIVER_HOST` |
| Super Admin | `admin.hvems.com.au` | `dev-admin.hvems.com.au` | `ADMIN_HOST` |
| Marketplace (2D, reserved) | `market.hvems.com.au` | `dev-market.hvems.com.au` | `MARKET_HOST` |

QR labels always print the **production** operator address, even when printed from development, because labels outlive test builds.

## DNS records (at whoever manages hvems.com.au)
One `CNAME` per address, pointing to Vercel (Vercel shows the exact target when each domain is added; usually `cname.vercel-dns.com`):
`portal`, `provider`, `operator`, `admin`, `market`, `dev-portal`, `dev-provider`, `dev-operator`, `dev-admin`, `dev-market`.
The website's own records (`@`, `www`) and the MailerSend records stay as they are.

## Settings per Vercel site
Both sites: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server only), the five `*_HOST` values above, `NEXT_PUBLIC_APP_URL` (the company address), `EMAIL_PROVIDER_API_KEY`, Stripe keys (test keys on development, live keys on production only). Region: `syd1`.

## Supabase Auth per project
- **Site URL:** the company address (`https://portal.hvems.com.au` or `https://dev-portal.hvems.com.au`). Email links are built from it.
- **Redirect URLs:** every address's `/auth/callback**` (the `**` matters).
- **SMTP:** MailerSend, sender `noreply@hvems.com.au`; templates uploaded with `scripts/email/apply-templates.mjs`.
- **Leaked password protection:** on.

## Releasing to production
1. Work lands on `develop`; check it on the development site.
2. Apply new migrations to production (reviewed migration files only; never through the Claude connector).
3. Merge `develop` into `main`; Vercel deploys production.
