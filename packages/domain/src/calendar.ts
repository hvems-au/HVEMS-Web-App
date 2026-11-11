/**
 * Business calendar — SoW §1.3 #13: the business calendar, billing month and
 * waiver rules use Queensland time (Australia/Brisbane). Queensland has not
 * observed daylight saving since 1992, so the offset is a fixed UTC+10:00.
 */
export const BUSINESS_TIMEZONE = "Australia/Brisbane";
const QLD_OFFSET_MS = 10 * 60 * 60 * 1000;

export interface BillingMonth {
  year: number;
  /** 1–12 */
  month: number;
}

export function billingMonthOf(instant: Date): BillingMonth {
  const qld = new Date(instant.getTime() + QLD_OFFSET_MS);
  return { year: qld.getUTCFullYear(), month: qld.getUTCMonth() + 1 };
}

/** UTC instants bounding a QLD calendar month: [start, end). */
export function billingMonthBounds({ year, month }: BillingMonth): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1) - QLD_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - QLD_OFFSET_MS);
  return { start, end };
}

export function billingMonthKey({ year, month }: BillingMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function previousBillingMonth({ year, month }: BillingMonth): BillingMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** dd/mm/yyyy in a given IANA timezone (SoW §12.1 local settings). */
export function formatDateAU(instant: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(instant);
}

export function formatDateTimeAU(instant: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

/**
 * Timezones an organisation or site can choose. The platform and the Super
 * Admin console use BUSINESS_TIMEZONE; each organisation's members see dates
 * and times in the organisation's own timezone (decision of 10 Nov 2026).
 */
export const AU_TIMEZONES = [
  { value: "Australia/Brisbane", label: "Brisbane (QLD)" },
  { value: "Australia/Sydney", label: "Sydney (NSW / ACT)" },
  { value: "Australia/Melbourne", label: "Melbourne (VIC)" },
  { value: "Australia/Hobart", label: "Hobart (TAS)" },
  { value: "Australia/Adelaide", label: "Adelaide (SA)" },
  { value: "Australia/Broken_Hill", label: "Broken Hill (NSW)" },
  { value: "Australia/Darwin", label: "Darwin (NT)" },
  { value: "Australia/Perth", label: "Perth (WA)" },
  { value: "Australia/Eucla", label: "Eucla (WA)" },
  { value: "Australia/Lord_Howe", label: "Lord Howe Island" },
] as const;

/** Options for a timezone select, keeping an unlisted current value selectable. */
export function timezoneOptions(current?: string | null): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = AU_TIMEZONES.map((t) => ({ value: t.value, label: t.label }));
  return current && !list.some((t) => t.value === current) ? [{ value: current, label: current }, ...list] : list;
}

/** Today's date (yyyy-mm-dd) in a timezone, for date inputs. */
export function todayISO(timeZone: string = BUSINESS_TIMEZONE, now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone });
}

/** Offset of a timezone from UTC at an instant, in minutes (e.g. +600 for Brisbane). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The instant a calendar day (YYYY-MM-DD) starts in a timezone, e.g. for "from" filters. */
export function startOfDayInZone(isoDate: string, timeZone: string = BUSINESS_TIMEZONE): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Second pass settles days where daylight saving changes the offset.
  return new Date(guess - zoneOffsetMinutes(new Date(first), timeZone) * 60000);
}
