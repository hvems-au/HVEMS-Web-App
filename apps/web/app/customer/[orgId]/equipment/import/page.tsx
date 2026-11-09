import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import equipment" };

export default async function ImportPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "assets.manage");
  return (
    <>
      <PageHeader
        title="Import equipment"
        description="Up to 1,000 rows per file. A trial run checks every row before anything is saved."
        breadcrumb={{ label: "Equipment", href: `/customer/${orgId}/equipment` }}
      />
      <ImportWizard orgId={orgId} />
    </>
  );
}
