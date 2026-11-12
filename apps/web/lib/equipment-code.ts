/**
 * Reads an equipment label code out of whatever was typed or scanned:
 * - the QR link (…/driver/e/<token or code>),
 * - the 22-character token on its own,
 * - the 10-character code printed under the label, with or without dashes/spaces
 *   ("P2DF-SBPG-97", "p2df sbpg 97").
 * Returns null when the text isn't a code, so the search falls back to rego, ID etc.
 * The alphabet matches the database (no 0/O/1/I/L).
 */
export type EquipmentCodeQuery = { token: string | null; shortCode: string | null };

const SHORT = /^[A-HJKMNP-Z2-9]{10}$/;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function equipmentCodeFromText(text: string | null | undefined): EquipmentCodeQuery | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const fromLink = raw.match(/\/driver\/e\/([A-Za-z0-9_-]+)/)?.[1];
  const candidate = fromLink ?? raw;
  const token = TOKEN.test(candidate) ? candidate : null;
  // Only treat as a typed code when it's made of code characters and separators.
  const short = /^[A-Za-z0-9\s-]+$/.test(candidate) ? candidate.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const shortCode = SHORT.test(short) ? short : null;
  if (!token && !shortCode) return null;
  return { token, shortCode };
}
