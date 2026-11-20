import type { Metadata } from "next";
import { ProposalsScreen } from "@/features/marketplace/screens/proposals";

export const metadata: Metadata = { title: "My proposals" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  return <ProposalsScreen orgId={orgId} sp={sp} portal="provider" />;
}
