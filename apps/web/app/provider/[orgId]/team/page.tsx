import type { Metadata } from "next";
import { TeamPage } from "@/features/org/team-page";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Team" };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <TeamPage ctx={await loadOrgContext(orgId, ["provider"])} portal="provider" />;
}
