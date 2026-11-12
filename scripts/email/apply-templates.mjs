// Uploads the HVEMS email templates (supabase/templates/) to a hosted Supabase project
// through the Management API, and turns on the four security notifications.
//
// Run it yourself; the access token never goes in a file or a chat:
//   PowerShell:  $env:SUPABASE_ACCESS_TOKEN = "<token>"; node scripts/email/apply-templates.mjs anvqykllajezwaasguqp
//   Git Bash:    SUPABASE_ACCESS_TOKEN=<token> node scripts/email/apply-templates.mjs anvqykllajezwaasguqp
// Create the token at https://supabase.com/dashboard/account/tokens and revoke it afterwards.
// Add --dry-run to print what would change without sending anything.
import { readFileSync } from "node:fs";

const [ref, flag] = process.argv.slice(2);
const dryRun = flag === "--dry-run";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !/^[a-z0-9]{20}$/.test(ref)) {
  console.error("Usage: node scripts/email/apply-templates.mjs <project-ref> [--dry-run]");
  process.exit(1);
}
if (!token && !dryRun) {
  console.error("Set SUPABASE_ACCESS_TOKEN first (see the comment at the top of this file).");
  process.exit(1);
}

const dir = new URL("../../supabase/templates/", import.meta.url);
const subjects = JSON.parse(readFileSync(new URL("subjects.json", dir), "utf8"));
const html = (name) => readFileSync(new URL(`${name}.html`, dir), "utf8");

const body = {};
for (const name of ["confirmation", "invite", "magic_link", "email_change", "recovery", "reauthentication"]) {
  body[`mailer_subjects_${name}`] = subjects[name].subject;
  body[`mailer_templates_${name}_content`] = html(name);
}
for (const kind of ["password_changed", "email_changed", "mfa_factor_enrolled", "mfa_factor_unenrolled"]) {
  const name = `${kind}_notification`;
  body[`mailer_notifications_${kind}_enabled`] = true;
  body[`mailer_subjects_${name}`] = subjects[name].subject;
  body[`mailer_templates_${name}_content`] = html(name);
}

if (dryRun) {
  for (const [k, v] of Object.entries(body)) console.log(k.padEnd(62), typeof v === "string" && v.length > 80 ? `${v.length} chars of HTML` : v);
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Supabase refused the update (${res.status}): ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
console.log(`Done: ${Object.keys(body).length} settings updated on ${ref}. Send yourself a password reset to check.`);
