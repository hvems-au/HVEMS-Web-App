import { renderToBuffer } from "@react-pdf/renderer";
import { getInspection, getOrganisation, signInspectionPhotos } from "@hvems/api-client";
import { orgLogoForPdf } from "@/lib/org-logo";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrestartPdf } from "@/lib/pdf/prestart-document";

export const runtime = "nodejs";

const MAX_PHOTOS = 12;

/**
 * Download a submitted pre-start as a PDF on HVEMS letterhead. Access is the
 * same as the record page: the signed-in member's RLS decides what is visible.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string; inspectionId: string }> }) {
  const { orgId, inspectionId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const data = await getInspection(db, inspectionId).catch(() => null);
  if (!data || data.inspection.organisation_id !== orgId) return new Response("Not found", { status: 404 });
  const org = await getOrganisation(db, orgId);

  // Embed photos (PNG/JPEG; other formats are skipped).
  const chosen = data.photos.slice(0, MAX_PHOTOS);
  const urls = await signInspectionPhotos(db, chosen.map((p) => p.storage_path), 120).catch(() => ({}) as Record<string, string>);
  const photos = (
    await Promise.all(
      chosen.map(async (p) => {
        const url = urls[p.storage_path];
        if (!url) return null;
        const res = await fetch(url).catch(() => null);
        const type = res?.headers.get("content-type") ?? "";
        if (!res?.ok || !/image\/(png|jpe?g)/.test(type)) return null;
        return { itemCode: p.item_code ?? "", data: Buffer.from(await res.arrayBuffer()) };
      }),
    )
  ).filter((p) => p !== null);

  const pdf = await renderToBuffer(
    PrestartPdf({
      company: org.name,
      companyLogo: await orgLogoForPdf(db, org.logo_path),
      timezone: ctx.timezone,
      inspection: data.inspection,
      answers: data.answers,
      defects: data.defects,
      photos,
      generatedAt: new Date(),
    }),
  );
  const day = new Date(data.inspection.submitted_at).toLocaleDateString("en-CA", { timeZone: ctx.timezone });
  const file = `prestart-${data.inspection.header.asset_number.replace(/[^A-Za-z0-9-]+/g, "_")}-${day}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
