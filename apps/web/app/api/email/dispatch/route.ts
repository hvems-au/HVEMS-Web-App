import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { emailConfigured, sendEmail } from "@/features/email/mailersend";
import { renderNotificationEmail, type NotificationEmailInput } from "@/features/email/render";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notificationPath, portalBasePath } from "@/lib/notification-links";
import { PORTAL_FOR_ORG_KIND, portalOrigin } from "@/lib/portals";
import type { OrganisationKind } from "@hvems/permissions";

/**
 * Sends queued notification emails (CS-40). Called every minute by pg_cron + pg_net
 * (supabase/migrations/20261125090000_email_notifications.sql) with the shared
 * EMAIL_DISPATCH_SECRET. The database decides who gets what; this route only delivers.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ClaimedEmail {
  id: string;
  organisation_id: string;
  organisation_name: string;
  organisation_kind: OrganisationKind;
  to_email: string;
  to_name: string;
  kind: string;
  notification_group: NotificationEmailInput["group"];
  title: string;
  body: string | null;
  link_path: string | null;
  asset_id: string | null;
  inspection_id: string | null;
  created_at: string;
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.EMAIL_DISPATCH_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const settingText = (rows: { key: string; value: unknown }[] | null, key: string, fallback: string) => {
  const v = rows?.find((r) => r.key === key)?.value;
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
};

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  // Without the MailerSend key, leave everything queued rather than burning retries.
  if (!emailConfigured()) return NextResponse.json({ error: "email provider not configured" }, { status: 503 });

  const db = createSupabaseAdminClient();
  const { data: settings } = await db.from("platform_settings").select("key, value").in("key", ["email.enabled", "email.from_address", "email.from_name"]);
  if (settings?.find((r) => r.key === "email.enabled")?.value !== true) return NextResponse.json({ sent: 0, reason: "email.enabled is off" });
  const from = { email: settingText(settings, "email.from_address", "notifications@hvems.com.au"), name: settingText(settings, "email.from_name", "HVEMS") };

  const { data, error } = await db.rpc("claim_email_batch", { p_limit: 25 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const batch = (data ?? []) as ClaimedEmail[];

  let sent = 0;
  let failed = 0;
  for (const m of batch) {
    const portal = PORTAL_FOR_ORG_KIND[m.organisation_kind] ?? "company";
    const origin = portalOrigin(portal);
    const base = portalBasePath(m.organisation_kind, m.organisation_id);
    const url = origin + notificationPath(m, base, `${base}/dashboard`);
    const optional = m.notification_group === "maintenance" || m.notification_group === "marketplace";
    const content = renderNotificationEmail({
      kind: m.kind,
      group: m.notification_group,
      title: m.title,
      body: m.body,
      organisationName: m.organisation_name,
      recipientName: m.to_name,
      url,
      preferencesUrl: optional ? `${origin}/account/notifications` : null,
      sentAt: new Date(m.created_at),
    });
    const res = await sendEmail({ email: m.to_email, name: m.to_name }, from, content);
    if (res.ok) sent++;
    else failed++;
    await db.rpc("complete_email", {
      p_id: m.id,
      p_ok: res.ok,
      p_error: res.error ?? null,
      p_message_id: res.messageId ?? null,
      p_give_up: !res.ok && !res.retry,
    });
  }
  return NextResponse.json({ claimed: batch.length, sent, failed });
}
