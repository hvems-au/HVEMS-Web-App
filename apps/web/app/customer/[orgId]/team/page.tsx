import type { Metadata } from "next";
import { TeamPage } from "@/features/org/team-page";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Team" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <TeamPage ctx={await loadOrgContext(orgId, ["company", "marketplace_customer"])} portal="customer" filter={{ q: one(sp.q), role: one(sp.role) }} />;
}
