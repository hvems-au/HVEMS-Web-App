# Sign-in emails (Supabase Auth)

Supabase Auth sends sign-up confirmations, password resets, email-change confirmations, verification codes and security notices. They go out through **MailerSend SMTP** from `noreply@hvems.com.au` (Authentication → Emails → SMTP Settings) and use the HVEMS-branded templates in `supabase/templates/`.

## How the links work
Email buttons open HVEMS's own page, `{{ .SiteURL }}/continue?token_hash=…&type=…&redirect_to=…`, never Supabase's address. That page uses nothing up: the one-time token is checked only when the person presses the button, on the portal named in `redirect_to` (only HVEMS portal addresses are accepted). So:
- people see an HVEMS address;
- a link opened on another device still works (no browser-bound code);
- link scanners (for example Microsoft 365 Safe Links) open the page, not the token, so links aren't used up early.

**Site URL** (Authentication → URL Configuration) must be the company portal: `http://company.localhost:3000` while testing, `https://company.hvems.com.au` in production. Every portal's `/auth/callback` must be in the Redirect URLs list.

## Changing a template
1. Edit the wording in `scripts/email/build-templates.mjs`. Every template shares one layout.
2. Run `node scripts/email/build-templates.mjs` to regenerate `supabase/templates/*.html` and `subjects.json`.
3. Upload them to the hosted project. Either:
   - **Script:** create a personal access token at supabase.com/dashboard/account/tokens, then run
     `$env:SUPABASE_ACCESS_TOKEN = "<token>"; node scripts/email/apply-templates.mjs <project-ref>` (PowerShell). Add `--dry-run` first to see what changes. Revoke the token afterwards.
   - **By hand:** paste each file into Authentication → Emails → Templates (and Security notifications), with the subject from `subjects.json`.
4. Send yourself a password reset to check.

Local development (`supabase start`) reads the same files through `supabase/config.toml`.

## Templates
| File | Dashboard name | Used by HVEMS today |
| --- | --- | --- |
| confirmation | Confirm sign up | Yes: new company and provider accounts |
| recovery | Reset password | Yes: Forgot password |
| invite | Invite user | Not yet (members are invited with HVEMS's own invitation links) |
| magic_link | Magic link | Not by email (portal hand-off and operator sign-in create links server-side) |
| email_change | Change email address | Not yet |
| reauthentication | Reauthentication | Not yet |
| password_changed_notification | Password changed | Yes (turned on) |
| email_changed_notification | Email address changed | Yes (turned on) |
| mfa_factor_enrolled_notification | Verification method added | Yes (turned on) |
| mfa_factor_unenrolled_notification | Verification method removed | Yes (turned on) |

## Things that break email links
- **Click tracking** in MailerSend rewrites links, so the one-time link no longer works. Keep click tracking **off** for the hvems.com.au domain.
- **Link scanners** can't use links up any more (see "How the links work"). If someone still sees "link expired", check the link wasn't older than 1 hour or already used.
- Links expire after the **Email OTP expiry** (Authentication → Providers → Email; default 1 hour). The templates say "1 hour"; change both together.
- The logo is text ("HV" orange, "EMS" charcoal) because many email apps block SVG images. Switch to a PNG logo once the app has its public address.
