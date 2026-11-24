"use server";
import { revalidatePath } from "next/cache";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Record the fleet subscription consent. The database checks the role, MFA, the current price and a saved card. */
export async function agreeFleetSubscriptionAction(orgId: string, perAssetCents: number, freeAssets: number): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("record_fleet_subscription_consent", {
      p_organisation_id: orgId,
      p_price_per_asset_cents: perAssetCents,
      p_free_assets: freeAssets,
    });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { status: "success", message: "Fleet subscription agreed. You can now add more than five assets." };
  } catch (e) {
    return errorState(e);
  }
}
