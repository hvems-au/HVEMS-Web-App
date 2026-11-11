import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import { formatShortCode, getAsset, getEquipmentCode, getOrganisation } from "@hvems/api-client";
import { EquipmentLabelPdf } from "@/lib/pdf/label-document";
import { orgLogoForPdf } from "@/lib/org-logo";
import { printedDriverUrl } from "@/lib/portals";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { equipmentCodeUrl } from "../qr-card";

export const runtime = "nodejs";

/** Printable 100 × 150 mm QR label for one piece of equipment. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const [asset, code, org] = await Promise.all([getAsset(db, assetId).catch(() => null), getEquipmentCode(db, assetId), getOrganisation(db, orgId)]);
  if (!asset || asset.organisation_id !== orgId || !code) return new Response("Not found", { status: 404 });
  const qrPng = await QRCode.toDataURL(equipmentCodeUrl(code.token), { width: 800, margin: 1, errorCorrectionLevel: "M", color: { dark: "#2b2b2b", light: "#ffffff" } });
  const pdf = await renderToBuffer(
    EquipmentLabelPdf({
      company: org.name,
      assetNumber: asset.asset_number,
      description: [asset.make, asset.model].filter(Boolean).join(" "),
      shortCode: formatShortCode(code.short_code),
      qrPng,
      portalUrl: printedDriverUrl(),
      companyLogo: await orgLogoForPdf(db, org.logo_path),
    }),
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="label-${asset.asset_number.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
