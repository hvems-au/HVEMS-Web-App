import "server-only";
import { getPersonNames, signDocumentLinks, type EquipmentDocument, type HvemsClient } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import type { DocRow } from "./equipment-documents";

/** Expiry status: expired, within 30 days, or fine. */
export function expiryOf(expiresOn: string | null, today: string): DocRow["expiry"] {
  if (!expiresOn) return null;
  if (expiresOn < today) return "expired";
  const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  return expiresOn <= in30 ? "soon" : "ok";
}

/** Rows for the documents list, with 5-minute private links (DOC-03). */
export async function toDocRows(db: HvemsClient, docs: EquipmentDocument[], tz: string, today: string): Promise<DocRow[]> {
  const [links, names] = await Promise.all([
    signDocumentLinks(
      db,
      docs.map((d) => d.path),
    ),
    getPersonNames(db, [...new Set(docs.map((d) => d.uploaded_by))]),
  ]);
  return docs.map((d) => ({
    id: d.id,
    category: d.category,
    title: d.title,
    fileName: d.file_name,
    expiresOn: d.expires_on,
    expiry: expiryOf(d.expires_on, today),
    uploadedBy: names.get(d.uploaded_by) ?? "Former member",
    uploadedAt: formatDateTimeAU(new Date(d.uploaded_at), tz),
    url: links.get(d.path) ?? null,
  }));
}
