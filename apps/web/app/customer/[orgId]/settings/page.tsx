import type { Metadata } from "next";
import { SettingsPage } from "@/features/org/settings-page";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <SettingsPage ctx={await loadOrgContext(orgId, ["company", "marketplace_customer"])} portal="customer" />;
}
