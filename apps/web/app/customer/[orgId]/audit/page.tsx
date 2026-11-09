import type { Metadata } from "next";
import { AuditPage } from "@/features/org/audit-page";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Audit History" };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <AuditPage ctx={await loadOrgContext(orgId, ["company", "marketplace_customer"])} />;
}
