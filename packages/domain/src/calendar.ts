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
