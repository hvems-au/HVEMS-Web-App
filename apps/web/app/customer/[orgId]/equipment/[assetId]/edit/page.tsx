import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAsset, listAssetClasses, listClients, listSites } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AssetForm } from "../../asset-form";

export const metadata: Metadata = { title: "Edit equipment" };

export default async function EditEquipmentPage({ params }: { params: Promise<{ orgId: string; assetId: string }> }) {
  const { orgId, assetId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "assets.manage");
  const db = await createSupabaseServerClient();
  const [asset, clients, sites, classes] = await Promise.all([
    getAsset(db, assetId).catch(() => null),
    listClients(db, orgId),
    listSites(db, orgId),
    listAssetClasses(db, orgId),
  ]);
  if (!asset || asset.organisation_id !== orgId || asset.archived_at) notFound();
  return (
    <>
      <PageHeader title={`Edit ${asset.asset_number}`} breadcrumb={{ label: asset.asset_number, href: `/customer/${orgId}/equipment/${assetId}` }} />
      <AssetForm
        orgId={orgId}
        assetId={assetId}
        clients={clients}
        sites={sites}
        classes={classes}
        canManageClasses={can(ctx.capabilities, "asset_classes.manage")}
        defaults={{
          asset_number: asset.asset_number,
          asset_class: asset.asset_class?.code ?? "",
          make: asset.make ?? "",
          model: asset.model ?? "",
          year: asset.year ? String(asset.year) : "",
          registration_number: asset.registration_number ?? "",
          registration_state: (asset.registration_state ?? "") as never,
          vin: asset.vin ?? "",
          serial_number: asset.serial_number ?? "",
          owner_type: asset.owner_type,
          client_id: asset.client_id ?? "",
          site_id: asset.site_id ?? "",
          meter_type: asset.meter_type,
          notes: asset.notes ?? "",
          prestart_frequency: asset.prestart_frequency ?? "",
          rops_fitted: asset.rops_fitted,
          fops_fitted: asset.fops_fitted,
          fire_suppression_fitted: asset.fire_suppression_fitted,
        }}
      />
    </>
  );
}
