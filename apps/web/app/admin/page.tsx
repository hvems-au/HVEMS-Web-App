import type { Metadata } from "next";
import { Building2, Store, Wrench } from "lucide-react";
import { PageHeader, StatCard } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Console" };

export default async function AdminHome() {
  const db = await createSupabaseServerClient();
  const count = async (kind: string) =>
    (await db.from("organisations").select("id", { count: "exact", head: true }).eq("kind", kind)).count ?? 0;
  const [companies, customers, providers] = await Promise.all([count("company"), count("marketplace_customer"), count("provider")]);
  return (
    <>
      <PageHeader title="Dashboard" description="Overview of platform activity across HVEMS" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Company organisations" value={companies} icon={<Building2 />} href="/admin/organisations?kind=company" />
        <StatCard label="Marketplace-only customers" value={customers} icon={<Store />} href="/admin/organisations?kind=marketplace_customer" />
        <StatCard label="Provider accounts" value={providers} icon={<Wrench />} href="/admin/organisations?kind=provider" />
      </div>
      <Card className="mt-5">
        <CardHeader title="Console scope" />
        <CardBody className="text-[14px] text-ink-muted">
          Organisation lists and platform settings are live. Verification, cases, billing adjustments with second approval above $500, moderation,
          support-access sessions and the rolling 12-month revenue figure for GST monitoring arrive with increment 2D.
        </CardBody>
      </Card>
    </>
  );
}
