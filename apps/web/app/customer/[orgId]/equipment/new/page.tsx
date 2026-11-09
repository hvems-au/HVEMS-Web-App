import type { Metadata } from "next";
import { getAssetConditionCounts, listAssetClasses, listClients, listSites } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { DEFAULT_PRICING, formatAud } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { FormAlert } from "@/components/ui/form";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AssetForm } from "../asset-form";

export const metadata: Metadata = { title: "New equipment" };

export default async function NewEquipmentPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "assets.manage");
  const db = await createSupabaseServerClient();
  const [clients, sites, counts, classes] = await Promise.all([
    listClients(db, orgId),
    listSites(db, orgId),
    getAssetConditionCounts(db, orgId),
    listAssetClasses(db, orgId),
  ]);
  return (
    <>
      <PageHeader title="New equipment" description="Register a vehicle, trailer, mobile plant or other equipment" breadcrumb={{ label: "Equipment", href: `/customer/${orgId}/equipment` }} />
      {counts.total >= DEFAULT_PRICING.fleetFreeAssets ? (
        <div className="mb-5">
          <FormAlert tone="info">
            You have {counts.total} current assets. The first {DEFAULT_PRICING.fleetFreeAssets} are free; each additional asset is{" "}
            {formatAud(DEFAULT_PRICING.fleetPerAssetCents)} per month. Before a sixth asset is saved, the Owner or a Finance member must agree to the fleet
            subscription and add a payment method.
          </FormAlert>
        </div>
      ) : null}
      <AssetForm orgId={orgId} clients={clients} sites={sites} classes={classes} canManageClasses={can(ctx.capabilities, "asset_classes.manage")} />
    </>
  );
}
