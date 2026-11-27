/**
 * Notification email content (brand: Orange #CE5502, Charcoal #444444, Montserrat with safe fallbacks).
 * Pure: no server imports, so it is unit-tested.
 */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationEmailInput {
  kind: string;
  group: "safety" | "account" | "marketplace" | "maintenance";
  title: string;
  body: string | null;
  organisationName: string;
  recipientName: string;
  /** Absolute link to the page in the portal. */
  url: string;
  /** Absolute link to the person's email preferences (not shown for safety or account emails). */
  preferencesUrl: string | null;
  sentAt: Date;
  /** Absolute link to the PNG logo for dark backgrounds (email clients do not show SVG). Falls back to the word HVEMS. */
  logoUrl?: string | null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** dd/mm/yyyy h:mm am/pm in Brisbane time. */
export function brisbaneDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

/** Notification emails never carry more than the in-app notification: title, short body and a link. */
export function renderNotificationEmail(input: NotificationEmailInput): EmailContent {
  const urgent = input.group === "safety";
  const subject = `${urgent ? "Safety alert: " : ""}${input.title}`.slice(0, 200);
  const when = brisbaneDateTime(input.sentAt);
  const why =
    input.group === "safety"
      ? "Safety alerts are always emailed to the people responsible for this equipment."
      : input.group === "account"
        ? "Account security notices are always emailed."
        : `You receive these because you are a member of ${input.organisationName} in HVEMS.`;

  const text = [
    input.title,
    "",
    input.body ?? "",
    "",
    `Open in HVEMS: ${input.url}`,
    "",
    `${input.organisationName} · ${when}`,
    why,
    input.preferencesUrl ? `Email preferences: ${input.preferencesUrl}` : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#444444;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#444444;padding:14px 24px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">${input.logoUrl ? `<img src="${e(input.logoUrl)}" width="160" height="47" alt="HVEMS" style="display:block;border:0;outline:none;width:160px;height:auto;color:#ffffff;font-size:18px;font-weight:700;">` : "HVEMS"}</td></tr>
${urgent ? `<tr><td style="background:#b42318;color:#ffffff;padding:10px 24px;font-size:14px;font-weight:700;">Safety alert</td></tr>` : ""}
<tr><td style="padding:24px;">
<p style="margin:0 0 4px;font-size:13px;color:#6b6b6b;">Hi ${e(input.recipientName)},</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#444444;">${e(input.title)}</h1>
${input.body ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${e(input.body)}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#CE5502;border-radius:6px;">
<a href="${e(input.url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Open in HVEMS</a>
</td></tr></table>
<p style="margin:20px 0 0;font-size:13px;color:#6b6b6b;">${e(input.organisationName)} · ${e(when)}</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#6b6b6b;">
${e(why)}${input.preferencesUrl ? ` <a href="${e(input.preferencesUrl)}" style="color:#CE5502;">Email preferences</a>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, html, text };
}
