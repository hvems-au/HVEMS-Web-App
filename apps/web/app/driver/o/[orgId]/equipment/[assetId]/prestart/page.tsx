import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAsset, getPrestartChecklist } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { OperatorAssetHeader, restrictionText } from "@/features/operator/asset-header";
import { loadOperatorContext } from "@/features/operator/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrestartForm } from "../../../../../../customer/[orgId]/equipment/[assetId]/prestart/prestart-form";

export const metadata: Metadata = { title: "Pre-start" };

/**
 * Pre-start for the selected equipment, using the same checklist and form as the
 * company portal. The database picks the checklist for this equipment, checks
 * every answer, records the signed-in operator and raises defects for faults.
 */
export default async function OperatorPrestart({ params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/equipment/${assetId}/prestart`);
  if (!ctx.capabilities.has("inspections.submit")) notFound();
  const db = await createSupabaseServerClient();
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId || asset.archived_at) notFound();
  const checklist = await getPrestartChecklist(db, assetId).catch(() => null);
  const restriction = restrictionText(asset.condition);

  if (!checklist || checklist.length === 0) {
    return (
      <>
        <OperatorAssetHeader asset={asset} />
        <Card>
          <CardHeader title="No pre-start checklist for this equipment" description="Your company hasn't set one up for this type of equipment yet. Tell your manager; you can still report an issue." />
          <CardBody className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={`${base}/equipment/${assetId}/report`}>Report an issue</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`${base}/equipment?for=prestart`}>Choose other equipment</Link>
            </Button>
          </CardBody>
        </Card>
      </>
    );
  }

  const tracksKm = asset.meter_type === "kilometres" || asset.meter_type === "both";
  const tracksHours = asset.meter_type === "hours" || asset.meter_type === "both";
  return (
    <>
      <h1 className="mb-3 text-[22px] font-bold text-ink">Pre-start</h1>
      <OperatorAssetHeader asset={asset} />
      {restriction?.tone === "danger" ? (
        <p role="status" className="mb-4 rounded-[10px] border border-danger-line bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger-ink">
          This equipment is out of service. A pre-start doesn&apos;t clear that; only a manager can return it to service.
        </p>
      ) : null}
      <PrestartForm
        orgId={orgId}
        assetId={assetId}
        checklist={checklist}
        tracksKm={tracksKm}
        tracksHours={tracksHours}
        lastKm={asset.current_odometer_km}
        lastHours={asset.current_engine_hours}
        doneBase={`${base}/prestarts`}
      />
    </>
  );
}
