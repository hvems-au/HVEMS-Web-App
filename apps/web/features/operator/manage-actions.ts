"use server";
import { revalidatePath } from "next/cache";
import { toAppError, type HvemsClient } from "@hvems/api-client";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Company-wide or per-operator equipment access (drivers.manage; checked by the database). */
export async function setOperatorEquipmentAccessAction(orgId: string, any: boolean): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await (db as unknown as HvemsClient).rpc("set_operator_equipment_access", { p_organisation_id: orgId, p_any: any });
    if (error) throw toAppError(error);
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success" };
  } catch (e) {
    return errorState(e);
  }
}
