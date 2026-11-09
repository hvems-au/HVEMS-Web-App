/**
 * Minimal RFC 4180 CSV parser for the asset import template. Handles quoted
 * fields, escaped quotes, CRLF/LF and a UTF-8 BOM. Shared by web and mobile.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      if (ch === "\r" && src[i + 1] === "\n") i++;
    } else {
      field += ch;
    }
    i++;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** Turn CSV rows into objects keyed by normalised header names. */
export function csvToRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [header, ...body] = parseCsv(text);
  const headers = (header ?? []).map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const records = body.map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const v = (cells[idx] ?? "").trim();
      if (h && v !== "") rec[h] = v;
    });
    return rec;
  });
  return { headers, records };
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
