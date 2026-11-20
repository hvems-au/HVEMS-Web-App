import type { Metadata } from "next";
import { EngagementScreen } from "@/features/marketplace/engagement-screen";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Engagement" };

export default async function CustomerEngagementPage({ params }: { params: Promise<{ orgId: string; engagementId: string }> }) {
  const { orgId, engagementId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  return <EngagementScreen engagementId={engagementId} ctx={ctx} base={`/customer/${orgId}`} />;
}
