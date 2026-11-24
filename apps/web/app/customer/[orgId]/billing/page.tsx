import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@hvems/permissions";
import { BillingPage } from "@/features/billing/billing-page";
import { loadOrgContext } from "@/lib/session";

export const metadata: Metadata = { title: "Billing" };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  if (!can(ctx.capabilities, "org.billing.view")) notFound();
  return <BillingPage ctx={ctx} />;
}
