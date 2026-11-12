// Builds the HVEMS-branded Supabase Auth email templates into supabase/templates/.
// Run: node scripts/email/build-templates.mjs
// Hosted project: paste each file into Authentication → Emails (see docs/operations/auth-emails.md).
import { mkdirSync, writeFileSync } from "node:fs";

const ORANGE = "#CE5502";
const CHARCOAL = "#444444";
const MUTED = "#6b6b6b";
const FONT = "Montserrat, 'Segoe UI', Arial, Helvetica, sans-serif";

function layout({ preheader, heading, body, button, after = "" }) {
  const btn = button
    ? `<tr><td style="padding:8px 0 24px 0;">
          <a href="${button.href}" style="display:inline-block;background:${ORANGE};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px;">${button.label}</a>
        </td></tr>`
    : "";
  const afterRow = after
    ? `<tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};padding:0 0 24px 0;">${after}</td></tr>`
    : "";
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 0 18px 4px;font-family:${FONT};font-size:26px;font-weight:800;letter-spacing:0.5px;">
        <span style="color:${ORANGE};">HV</span><span style="color:${CHARCOAL};">EMS</span>
        <div style="font-size:10px;font-weight:600;letter-spacing:1.5px;color:${MUTED};margin-top:2px;">HEAVY VEHICLE &amp; EQUIPMENT MANAGEMENT SYSTEM</div>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:12px;border-top:4px solid ${ORANGE};padding:32px 32px 8px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-family:${FONT};font-size:21px;font-weight:700;color:${CHARCOAL};padding:0 0 14px 0;">${heading}</td></tr>
          <tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${CHARCOAL};padding:0 0 18px 0;">${body}</td></tr>
          ${btn}
          ${afterRow}
        </table>
      </td></tr>
      <tr><td style="font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};padding:18px 4px 0 4px;">
        This email was sent to {{ .Email }} by HVEMS. It's an automatic message; replies aren't monitored.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

const linkNote = (expiry) =>
  `The button works once and expires in ${expiry}. If it doesn't open, copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:${ORANGE};word-break:break-all;">{{ .ConfirmationURL }}</a>`;
const notYou = "If you didn't ask for this, you can ignore this email.";
const securityFooter = "If this wasn't you, reset your password straight away from the sign-in page and contact your Company Admin or HVEMS support.";

export const templates = {
  // Authentication emails (Authentication → Emails → Templates)
  confirmation: {
    label: "Confirm sign up",
    subject: "Confirm your email for HVEMS",
    html: layout({
      preheader: "One click to finish setting up your HVEMS account.",
      heading: "Confirm your email",
      body: "Thanks for signing up. Confirm this email address to finish setting up your HVEMS account.",
      button: { href: "{{ .ConfirmationURL }}", label: "Confirm email" },
      after: `${linkNote("1 hour")}<br><br>${notYou}`,
    }),
  },
  invite: {
    label: "Invite user",
    subject: "You've been invited to HVEMS",
    html: layout({
      preheader: "Accept your invitation to HVEMS.",
      heading: "You've been invited to HVEMS",
      body: "You've been invited to join HVEMS. Accept the invitation to set your password and sign in.",
      button: { href: "{{ .ConfirmationURL }}", label: "Accept invitation" },
      after: `${linkNote("1 hour")}<br><br>If you weren't expecting this, you can ignore this email.`,
    }),
  },
  magic_link: {
    label: "Magic link",
    subject: "Your HVEMS sign-in link",
    html: layout({
      preheader: "Your one-time sign-in link for HVEMS.",
      heading: "Sign in to HVEMS",
      body: 'Use the button below to sign in, or enter this code: <strong style="font-size:18px;letter-spacing:3px;">{{ .Token }}</strong>',
      button: { href: "{{ .ConfirmationURL }}", label: "Sign in" },
      after: `${linkNote("1 hour")}<br><br>${notYou}`,
    }),
  },
  email_change: {
    label: "Change email address",
    subject: "Confirm your new email for HVEMS",
    html: layout({
      preheader: "Confirm the new email address for your HVEMS account.",
      heading: "Confirm your new email",
      body: "You asked to change your HVEMS sign-in email from {{ .Email }} to <strong>{{ .NewEmail }}</strong>. Confirm the change below.",
      button: { href: "{{ .ConfirmationURL }}", label: "Confirm new email" },
      after: `${linkNote("1 hour")}<br><br>${securityFooter}`,
    }),
  },
  recovery: {
    label: "Reset password",
    subject: "Reset your HVEMS password",
    html: layout({
      preheader: "Choose a new password for HVEMS.",
      heading: "Reset your password",
      body: "We received a request to reset the password for your HVEMS account. Choose a new one using the button below.",
      button: { href: "{{ .ConfirmationURL }}", label: "Choose a new password" },
      after: `${linkNote("1 hour")}<br><br>If you didn't ask to reset your password, ignore this email. Your password won't change.`,
    }),
  },
  reauthentication: {
    label: "Reauthentication",
    subject: "Your HVEMS verification code: {{ .Token }}",
    html: layout({
      preheader: "Your HVEMS verification code.",
      heading: "Your verification code",
      body: `Enter this code to confirm it's you:<br><br><span style="display:inline-block;font-size:28px;font-weight:800;letter-spacing:6px;color:${ORANGE};">{{ .Token }}</span>`,
      after: `The code works once and expires shortly. ${notYou}`,
    }),
  },
  // Security notifications (Authentication → Emails → Security notifications; turn each on)
  password_changed_notification: {
    label: "Password changed",
    subject: "Your HVEMS password was changed",
    html: layout({
      preheader: "Your HVEMS password was just changed.",
      heading: "Your password was changed",
      body: "The password for your HVEMS account ({{ .Email }}) was just changed.",
      after: securityFooter,
    }),
  },
  email_changed_notification: {
    label: "Email address changed",
    subject: "Your HVEMS sign-in email was changed",
    html: layout({
      preheader: "Your HVEMS sign-in email was changed.",
      heading: "Your sign-in email was changed",
      body: "The sign-in email for your HVEMS account was changed from {{ .OldEmail }} to <strong>{{ .Email }}</strong>.",
      after: securityFooter,
    }),
  },
  mfa_factor_enrolled_notification: {
    label: "MFA method added",
    subject: "An authenticator app was added to your HVEMS account",
    html: layout({
      preheader: "A sign-in verification method was added.",
      heading: "Authenticator app added",
      body: "An authenticator app ({{ .FactorType }}) was added to your HVEMS account. You'll use it for the 6-digit code when you sign in.",
      after: securityFooter,
    }),
  },
  mfa_factor_unenrolled_notification: {
    label: "MFA method removed",
    subject: "An authenticator app was removed from your HVEMS account",
    html: layout({
      preheader: "A sign-in verification method was removed.",
      heading: "Authenticator app removed",
      body: "An authenticator app ({{ .FactorType }}) was removed from your HVEMS account.",
      after: securityFooter,
    }),
  },
};

const out = new URL("../../supabase/templates/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(templates)) writeFileSync(new URL(`${name}.html`, out), t.html);
writeFileSync(
  new URL("subjects.json", out),
  JSON.stringify(Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, { dashboard: t.label, subject: t.subject }])), null, 2) + "\n",
);
console.log(`Wrote ${Object.keys(templates).length} templates to supabase/templates/`);
