import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAsset } from "@hvems/api-client";
import { Card, CardBody } from "@/components/ui/primitives";
import { OperatorAssetHeader } from "@/features/operator/asset-header";
import { loadOperatorContext } from "@/features/operator/context";
import { IssueForm } from "@/features/operator/issue-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Report an issue" };

/** Report an issue on the selected equipment, with or without a pre-start. */
export default async function OperatorReport({ params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const base = `/driver/o/${orgId}`;
  const ctx = await loadOperatorContext(orgId, `${base}/equipment/${assetId}/report`);
  if (!ctx.capabilities.has("defects.report")) notFound();
  const db = await createSupabaseServerClient();
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId || asset.archived_at) notFound();
  return (
    <>
      <h1 className="mb-3 text-[22px] font-bold text-ink">Report an issue</h1>
      <OperatorAssetHeader asset={asset} />
      <Card>
        <CardBody>
          <IssueForm orgId={orgId} assetId={assetId} doneBase={`${base}/issues`} />
        </CardBody>
      </Card>
    </>
  );
}
