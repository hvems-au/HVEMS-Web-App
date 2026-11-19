import type { Metadata } from "next";
import { EngagementScreen } from "@/features/marketplace/engagement-screen";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Engagement" };

export default async function ProviderEngagementPage({ params }: { params: Promise<{ orgId: string; engagementId: string }> }) {
  const { orgId, engagementId } = await params;
  const ctx = await loadOrgContext(orgId, ["provider"]);
  return <EngagementScreen engagementId={engagementId} ctx={ctx} side="provider" base={`/provider/${orgId}`} />;
}
