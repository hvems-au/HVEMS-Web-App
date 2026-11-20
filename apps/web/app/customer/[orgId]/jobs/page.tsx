import type { Metadata } from "next";
import { BrowseJobsScreen } from "@/features/marketplace/screens/browse-jobs";

export const metadata: Metadata = { title: "Find work" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  return <BrowseJobsScreen orgId={orgId} sp={sp} portal="company" />;
}
