import {
  BadgeCheck,
  Bell,
  BellRing,
  ClipboardX,
  CreditCard,
  FileClock,
  FileText,
  FileWarning,
  Gauge,
  Hand,
  Handshake,
  IdCard,
  LifeBuoy,
  MessageSquare,
  OctagonAlert,
  PackageCheck,
  Receipt,
  Scale,
  ShieldCheck,
  Store,
  TriangleAlert,
  UserX,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Notification groups, matching app.notification_group() in the database. */
export type NotificationGroup = "safety" | "maintenance" | "marketplace" | "account";

export const GROUP_LABEL: Record<NotificationGroup, string> = {
  safety: "Safety",
  maintenance: "Maintenance",
  marketplace: "Marketplace",
  account: "Account",
};

type Tone = "danger" | "warn" | "info" | "ok" | "brand";

export interface NotificationKindMeta {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  group: NotificationGroup;
}

/** Icon colour on a soft circle of the same tone. */
export const TONE_CLASS: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger-ink",
  warn: "bg-warn-soft text-warn-ink",
  info: "bg-info-soft text-info-ink",
  ok: "bg-ok-soft text-ok-ink",
  brand: "bg-brand-soft text-brand-ink",
};

const KINDS: Record<string, NotificationKindMeta> = {
  critical_defect: { label: "Critical defect", icon: OctagonAlert, tone: "danger", group: "safety" },
  operator_not_fit: { label: "Operator not fit", icon: UserX, tone: "danger", group: "safety" },
  out_of_service_hold: { label: "Out-of-service hold", icon: Hand, tone: "danger", group: "safety" },
  breakdown: { label: "Breakdown", icon: Wrench, tone: "danger", group: "safety" },
  regulator_notice: { label: "Defect notice", icon: FileWarning, tone: "danger", group: "safety" },
  alert_escalated: { label: "Escalated alert", icon: BellRing, tone: "danger", group: "safety" },
  minor_defect: { label: "Minor defect", icon: TriangleAlert, tone: "warn", group: "maintenance" },
  needs_attention_hold: { label: "Needs-attention hold", icon: Hand, tone: "warn", group: "maintenance" },
  credential_expiring: { label: "Credential expiring", icon: IdCard, tone: "warn", group: "maintenance" },
  credential_expired: { label: "Credential expired", icon: IdCard, tone: "danger", group: "maintenance" },
  prestart_missed: { label: "Missed pre-start", icon: ClipboardX, tone: "warn", group: "maintenance" },
  meter_reading_review: { label: "Reading to approve", icon: Gauge, tone: "warn", group: "maintenance" },
  parts_approval: { label: "Parts to approve", icon: PackageCheck, tone: "warn", group: "maintenance" },
  parts_decision: { label: "Parts decision", icon: PackageCheck, tone: "info", group: "maintenance" },
  document_expiring: { label: "Document expiring", icon: FileClock, tone: "warn", group: "maintenance" },
  provider_verification: { label: "Verification", icon: BadgeCheck, tone: "info", group: "marketplace" },
  provider_document_expiring: { label: "Provider document expiring", icon: FileClock, tone: "warn", group: "marketplace" },
  marketplace_job: { label: "Marketplace job", icon: Store, tone: "brand", group: "marketplace" },
  marketplace_message: { label: "Marketplace question", icon: MessageSquare, tone: "info", group: "marketplace" },
  marketplace_proposal: { label: "Proposal", icon: FileText, tone: "ok", group: "marketplace" },
  marketplace_engagement: { label: "Engagement", icon: Handshake, tone: "ok", group: "marketplace" },
  marketplace_case: { label: "Case", icon: Scale, tone: "warn", group: "marketplace" },
  support_access_started: { label: "Support access", icon: LifeBuoy, tone: "info", group: "account" },
  billing_invoice: { label: "Invoice", icon: Receipt, tone: "info", group: "account" },
  billing_payment_failed: { label: "Payment failed", icon: CreditCard, tone: "danger", group: "account" },
  billing_restricted: { label: "Account restricted", icon: CreditCard, tone: "danger", group: "account" },
  billing_restored: { label: "Account restored", icon: ShieldCheck, tone: "ok", group: "account" },
};

const FALLBACK: NotificationKindMeta = { label: "Notification", icon: Bell, tone: "info", group: "maintenance" };

/** Label, icon, tone and group for a notification kind; never undefined, so a new kind can't break a page. */
export function notificationKind(kind: string): NotificationKindMeta {
  return KINDS[kind] ?? FALLBACK;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
