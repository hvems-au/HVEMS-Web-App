/** Driver credentials (2B): licence, plant ticket, induction card, track safety, other. */
export const CREDENTIAL_KINDS = ["driver_licence", "plant_ticket", "induction_card", "track_safety", "other"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_LABELS: Record<CredentialKind, string> = {
  driver_licence: "Driver licence",
  plant_ticket: "Plant ticket (HRWL)",
  induction_card: "Induction card",
  track_safety: "Track safety card",
  other: "Other",
};

/** What the optional label means for each kind (shown as the field's name). */
export const CREDENTIAL_LABEL_HINTS: Record<CredentialKind, string> = {
  driver_licence: "Class (e.g. HR, MC)",
  plant_ticket: "Classes (e.g. LF, DG)",
  induction_card: "Site or issuer (e.g. White Card)",
  track_safety: "Level (e.g. TSC, RISI)",
  other: "Name of the card or ticket",
};

export type CredentialStatus = "expired" | "expiring" | "current" | "no_expiry";

/**
 * Status on a given day (ISO dates, the company's calendar): expired after the
 * expiry date; expiring within the warning period (setting, 30 days).
 */
export function credentialStatus(expiresOn: string | null | undefined, today: string, warningDays = 30): CredentialStatus {
  if (!expiresOn) return "no_expiry";
  if (expiresOn < today) return "expired";
  const warnFrom = new Date(`${today}T00:00:00Z`);
  warnFrom.setUTCDate(warnFrom.getUTCDate() + warningDays);
  return expiresOn <= warnFrom.toISOString().slice(0, 10) ? "expiring" : "current";
}

/** "Driver licence · HR", "Plant ticket (HRWL)", or the name of an "other" card. */
export function credentialTitle(c: { kind: CredentialKind; label: string | null }): string {
  return c.kind === "other" ? (c.label ?? "Other") : `${CREDENTIAL_LABELS[c.kind]}${c.label ? ` · ${c.label}` : ""}`;
}
