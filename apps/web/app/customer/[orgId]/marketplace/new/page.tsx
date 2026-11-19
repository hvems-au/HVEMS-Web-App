import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkOrder, listAssetsForExport, listMarketplaceRegions } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody } from "@/components/ui/primitives";
import { PostJobForm, type PostAsset } from "@/features/marketplace/post-job-form";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Post a job" };

/** Post a marketplace job (MKT-04), optionally prefilled from an open work order (?wo=). */
export default async function PostJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company", "marketplace_customer"]);
  if (!can(ctx.capabilities, "marketplace.post")) notFound();
  const db = await createSupabaseServerClient();
  const woId = firstParam(sp.wo);
  const [regions, assets, wo, fees] = await Promise.all([
    listMarketplaceRegions(db),
    ctx.context.kind === "company" ? listAssetsForExport(db, { organisationId: orgId, status: "current" }) : Promise.resolve([]),
    woId ? getWorkOrder(db, orgId, woId).catch(() => null) : Promise.resolve(null),
    db.from("platform_settings").select("key, value").in("key", ["pricing.connection_fee_standard_cents", "pricing.connection_fee_urgent_cents"]),
  ]);
  const fee = (k: string, d: number) => Number(fees.data?.find((r) => r.key === k)?.value ?? d) || d;
  const options: PostAsset[] = assets.map((a) => ({
    value: a.id,
    label: [a.asset_number, a.make, a.model].filter(Boolean).join(" · "),
    details: {
      class: a.asset_class?.name ?? null,
      make: a.make,
      model: a.model,
      year: a.year,
      registration: a.registration_number,
      vin: a.vin,
      serial_number: a.serial_number,
      odometer_km: a.current_odometer_km === null ? null : Number(a.current_odometer_km),
      engine_hours: a.current_engine_hours === null ? null : Number(a.current_engine_hours),
    },
  }));

  return (
    <>
      <PageHeader
        title="Post a job"
        description={wo ? `From work order WO-${String(wo.number).padStart(4, "0")}: the job will be linked back to it.` : "Verified providers who cover your area and service are alerted."}
        breadcrumb={{ label: "Marketplace", href: `/customer/${orgId}/marketplace` }}
      />
      <Card>
        <CardBody>
          <PostJobForm
            orgId={orgId}
            kind={ctx.context.kind === "company" ? "company" : "marketplace_customer"}
            regions={regions}
            assets={options}
            fees={{ standard: fee("pricing.connection_fee_standard_cents", 2900), urgent: fee("pricing.connection_fee_urgent_cents", 4900) }}
            prefill={wo ? { workOrderId: wo.id, assetId: wo.asset_id, title: wo.title, description: wo.description ?? "", urgent: wo.priority === "urgent" } : undefined}
          />
        </CardBody>
      </Card>
    </>
  );
}
