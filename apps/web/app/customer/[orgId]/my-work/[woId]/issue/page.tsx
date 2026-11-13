import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAsset, getWorkOrder } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { BackLink } from "@/components/back-link";
import { Card, CardBody } from "@/components/ui/primitives";
import { OperatorAssetHeader } from "@/features/operator/asset-header";
import { IssueForm } from "@/features/operator/issue-form";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Report an issue" };

/** Report an issue found during a job; it goes into Defects & Safety, then back to the job. */
export default async function JobIssue({ params }: { params: Promise<{ orgId: string; woId: string }> }) {
  const { orgId, woId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "defects.report")) notFound();
  const db = await createSupabaseServerClient();
  const w = await getWorkOrder(db, orgId, woId);
  if (!w) notFound();
  const asset = await getAsset(db, w.asset_id).catch(() => null);
  if (!asset) notFound();
  const job = `/customer/${orgId}/my-work/${woId}`;
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href={job} label={w.title} />
      <h1 className="mb-1 text-[24px] font-bold text-ink">Report an issue</h1>
      <p className="mb-4 text-[14px] text-ink-muted">Something you found during the job that needs its own repair or a manager&apos;s attention.</p>
      <OperatorAssetHeader asset={asset} />
      <Card>
        <CardBody>
          <IssueForm orgId={orgId} assetId={w.asset_id} doneBase={`/customer/${orgId}/defects`} returnTo={job} />
        </CardBody>
      </Card>
    </div>
  );
}
