import "server-only";
import { downloadOrganisationLogo, type HvemsClient } from "@hvems/api-client";

/** An image for react-pdf as raw bytes (data URIs don't render in repeating page headers). */
export type PdfImage = { data: Buffer; format: "png" | "jpg" };

/** The company logo for PDFs (labels, pre-start records), or null when there is none. */
export async function orgLogoForPdf(db: HvemsClient, path: string | null | undefined): Promise<PdfImage | null> {
  const logo = await downloadOrganisationLogo(db, path).catch(() => null);
  return logo ? { data: Buffer.from(logo.bytes), format: logo.type === "image/jpeg" ? "jpg" : "png" } : null;
}
