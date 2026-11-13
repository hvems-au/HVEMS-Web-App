import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAsset } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { BackLink } from "@/components/back-link";
import { Card, CardBody } from "@/components/ui/primitives";
import { OperatorAssetHeader } from "@/features/operator/asset-header";
import { IssueForm } from "@/features/operator/issue-form";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Report an issue" };

/** Report an issue on any equipment (technician workspace). */
export default async function TechIssue({ params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "defects.report")) notFound();
  const db = await createSupabaseServerClient();
  const asset = await getAsset(db, assetId).catch(() => null);
  if (!asset || asset.organisation_id !== orgId || asset.archived_at) notFound();
  const home = `/customer/${orgId}/my-work`;
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={`${home}/equipment?for=issue`} label="Choose equipment" />
      <h1 className="mb-3 text-[24px] font-bold text-ink">Report an issue</h1>
      <OperatorAssetHeader asset={asset} />
      <Card>
        <CardBody>
          <IssueForm orgId={orgId} assetId={assetId} doneBase={`/customer/${orgId}/defects`} returnTo={home} />
        </CardBody>
      </Card>
    </div>
  );
}
