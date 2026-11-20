import type { Metadata } from "next";
import { ProviderJobScreen } from "@/features/marketplace/screens/provider-job";

export const metadata: Metadata = { title: "Job" };

export default async function Page({ params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  return <ProviderJobScreen orgId={orgId} jobId={jobId} portal="provider" />;
}
