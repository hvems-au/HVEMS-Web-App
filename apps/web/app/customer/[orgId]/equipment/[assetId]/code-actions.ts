"use server";
import { revalidatePath } from "next/cache";
import { generateEquipmentCode } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** "Generate QR code" / "Replace code" (decision O-10). The database checks the role and the reason. */
export async function generateCodeAction(orgId: string, assetId: string, replaceReason?: string): Promise<ActionState> {
  const reason = z.string().trim().max(500).optional().parse(replaceReason);
  try {
    const db = await createSupabaseServerClient();
    await generateEquipmentCode(db, assetId, reason);
    revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
    return { status: "success", message: reason ? "New code issued. Print and fit the new label; the old one no longer works." : "QR code generated" };
  } catch (e) {
    return errorState(e);
  }
}
