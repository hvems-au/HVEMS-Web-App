# Sign-in emails (Supabase Auth)

Supabase Auth sends sign-up confirmations, password resets, email-change confirmations, verification codes and security notices. They go out through **MailerSend SMTP** from `noreply@hvems.com.au` (Authentication → Emails → SMTP Settings) and use the HVEMS-branded templates in `supabase/templates/`.

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
- **Link scanners** (for example Microsoft 365 Safe Links) can open a link before the person does and use it up ("link expired"). If companies on Microsoft 365 report this, change the templates to open an HVEMS page with a "Continue" button first (Supabase docs, Email Templates → Email prefetching).
- Links expire after the **Email OTP expiry** (Authentication → Providers → Email; default 1 hour). The templates say "1 hour"; change both together.
- The logo is text ("HV" orange, "EMS" charcoal) because many email apps block SVG images. Switch to a PNG logo once the app has its public address.
