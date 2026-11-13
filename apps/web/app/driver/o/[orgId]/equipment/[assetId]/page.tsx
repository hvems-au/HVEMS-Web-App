import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, MessageSquareWarning, OctagonAlert, TriangleAlert, UserRoundX } from "lucide-react";
import { driverSignOutAction } from "@/app/driver/actions";
import { getAsset, listDefects } from "@hvems/api-client";
import { DEFECT_SEVERITY_LABELS } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { OperatorAssetHeader, restrictionText } from "@/features/operator/asset-header";
import { loadOperatorContext } from "@/features/operator/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Equipment" };

/** The selected vehicle or machine: restrictions, what's already reported, and the two actions. */
export default async function OperatorAsset({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, assetId }, sp] = await Promise.all([params, searchParams]);
  // Came from scanning a QR label while already signed in (e.g. a shared site tablet).
  const viaQr = sp.via === "qr";
  const qrCode = typeof sp.code === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(sp.code) ? sp.code : undefined;
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/equipment/${assetId}`);
  const db = await createSupabaseServerClient();
  // RLS: only equipment of this company the operator may use; anything else is "not found".
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId || asset.archived_at) notFound();
  const open = await listDefects(db, { organisationId: orgId, assetId, status: "open" }).catch(() => []);
  const restriction = restrictionText(asset.condition);

  return (
    <>
      {viaQr ? (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border-2 border-brand/50 bg-brand-soft px-4 py-3">
          <p className="text-[14.5px] text-ink">
            Signed in as <span className="font-semibold">{ctx.user.fullName || ctx.user.email}</span>. Everything you do here is recorded under this name.
          </p>
          <form action={driverSignOutAction.bind(null, qrCode)}>
            <Button type="submit" variant="secondary" size="sm">
              <UserRoundX /> Not you? Switch user
            </Button>
          </form>
        </div>
      ) : null}
      <OperatorAssetHeader asset={asset} />
      {restriction ? (
        <div
          role="status"
          className={cn(
            "mb-4 flex items-start gap-2.5 rounded-[10px] border px-4 py-3 text-[14px] font-medium",
            restriction.tone === "danger" ? "border-danger-line bg-danger-soft text-danger-ink" : "border-warn-line bg-warn-soft text-warn-ink",
          )}
        >
          {restriction.tone === "danger" ? <OctagonAlert className="mt-0.5 size-5 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />}
          {restriction.text}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ctx.capabilities.has("inspections.submit") ? (
          <Button asChild size="lg" className="h-14 text-[16px]">
            <Link href={`${base}/equipment/${assetId}/prestart`}>
              <ClipboardCheck className="!size-5" /> Start pre-start
            </Link>
          </Button>
        ) : null}
        {ctx.capabilities.has("defects.report") ? (
          <Button asChild variant="secondary" size="lg" className="h-14 text-[16px]">
            <Link href={`${base}/equipment/${assetId}/report`}>
              <MessageSquareWarning className="!size-5" /> Report an issue
            </Link>
          </Button>
        ) : null}
      </div>
      <Card className="mt-5">
        <CardHeader title={`Already reported (${open.length})`} description={open.length ? "No need to report these again." : undefined} />
        {open.length === 0 ? (
          <p className="px-5 pt-1 pb-5 text-[14px] text-ink-muted">No open issues on this equipment.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stroke">
            {open.map((d) => (
              <li key={d.id} className="flex items-start gap-2.5 px-5 py-3 text-[14px]">
                <Badge tone={d.severity === "critical" ? "red" : d.severity === "minor" ? "amber" : "grey"}>{DEFECT_SEVERITY_LABELS[d.severity]}</Badge>
                <span className="text-ink">{d.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
