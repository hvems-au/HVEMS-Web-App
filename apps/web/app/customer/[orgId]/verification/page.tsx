import type { Metadata } from "next";
import { VerificationScreen } from "@/features/marketplace/screens/verification";

export const metadata: Metadata = { title: "Provider profile" };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <VerificationScreen orgId={orgId} portal="company" />;
}
