/** Australian Business Number checksum (ABR algorithm). Mirrors app.is_valid_abn. */
export function isValidAbn(input: string): boolean {
  const digits = input.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = [...digits].reduce((acc, ch, i) => acc + (Number(ch) - (i === 0 ? 1 : 0)) * (weights[i] ?? 0), 0);
  return sum % 89 === 0;
}

export function formatAbn(input: string): string {
  const d = input.replace(/\s/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : input;
}

/** Driver PIN rules (SoW §3.2): personal 6-digit PIN; 5 wrong attempts lock the profile for 15 minutes. */
export const DRIVER_PIN_LENGTH = 6;
export const DRIVER_PIN_MAX_ATTEMPTS = 5;
export const DRIVER_PIN_LOCKOUT_MINUTES = 15;

export function isWellFormedDriverPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/**
 * Recommended (not in SoW): refuse trivially guessable PINs at setup.
 * Kept separate so HVEMS can decide whether to enforce it.
 */
export function isTriviallyGuessablePin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const asc = "0123456789012345";
  const desc = "9876543210987654";
  return asc.includes(pin) || desc.includes(pin);
}

export function pinLockedUntil(failedAttempts: number, lastFailureAt: Date): Date | null {
  if (failedAttempts < DRIVER_PIN_MAX_ATTEMPTS) return null;
  return new Date(lastFailureAt.getTime() + DRIVER_PIN_LOCKOUT_MINUTES * 60_000);
}

export type MfaRole = "owner" | "administrator" | "finance" | "provider_owner" | "staff" | "other";

/** SoW §2.5 MFA requirement. */
export function isMfaRequired(role: MfaRole, org: { memberCount: number; hasPaymentMethod: boolean }): boolean {
  switch (role) {
    case "staff":
      return true;
    case "owner":
    case "administrator":
    case "finance":
      return org.memberCount >= 2 || org.hasPaymentMethod;
    case "provider_owner":
      return org.hasPaymentMethod;
    default:
      return false;
  }
}
