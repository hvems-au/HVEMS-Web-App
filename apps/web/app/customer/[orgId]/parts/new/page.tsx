import type { Metadata } from "next";
import { listCatalogue, listSites, listSuppliers, listWorkOrders } from "@hvems/api-client";
import { PageHeader } from "@/components/shell/page";
import { PartsRequestForm } from "@/features/parts/request-form";
import { maintenanceOptions } from "@/features/maintenance/options";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "New parts request" };

/** New parts request (PRT-01). ?asset= and ?wo= preset it from a job or equipment page. */
export default async function NewPartsRequest({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "parts.request");
  const db = await createSupabaseServerClient();
  const [opts, wos, sites, suppliers, catalogue] = await Promise.all([
    maintenanceOptions(db, orgId),
    listWorkOrders(db, orgId, { open: true }).catch(() => []),
    listSites(db, orgId).catch(() => []),
    listSuppliers(db, orgId).catch(() => []),
    listCatalogue(db, orgId).catch(() => []),
  ]);
  const ret = firstParam(sp.return);
  const returnTo = ret && ret.startsWith(`/customer/${orgId}/`) && !ret.includes("//") ? ret : undefined;
  const base = `/customer/${orgId}/parts`;

  return (
    <>
      <PageHeader
        title="New parts request"
        description="Within your own Approval Limit it's approved straight away; otherwise someone with a high enough limit is asked."
        breadcrumb={returnTo ? { label: "Back to the job", href: returnTo } : { label: "Parts", href: base }}
      />
      <PartsRequestForm
        orgId={orgId}
        equipment={opts.equipment}
        workOrders={wos
          .filter((w) => w.status === "open" || w.status === "in_progress")
          .map((w) => ({ value: w.id, label: `WO-${String(w.number).padStart(4, "0")} · ${w.title}`, assetId: w.asset_id }))}
        sites={sites.map((s) => ({ value: s.id, label: s.name }))}
        suppliers={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        catalogue={catalogue.map((c) => ({
          id: c.id,
          label: `${c.description}${c.part_number ? ` · ${c.part_number}` : ""}`,
          description: c.description,
          part_number: c.part_number,
          unit: c.unit,
          cost: c.default_unit_cost_cents,
          supplier_id: c.supplier_id,
        }))}
        preset={{ assetId: firstParam(sp.asset), workOrderId: firstParam(sp.wo) }}
        returnTo={returnTo}
      />
    </>
  );
}
