import { orgAuditCsvResponse } from "@/features/audit/export-route";

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return orgAuditCsvResponse(request, orgId, ["company", "marketplace_customer"]);
}
