"use server";
import { revalidatePath } from "next/cache";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Close the organisation (Owner / Account Owner / Provider Owner). The database checks the export, work in progress and the name. */
export async function closeOrganisationAction(orgId: string, confirmName: string, reason: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("close_organisation" as never, { p_organisation_id: orgId, p_confirm_name: confirmName, p_reason: reason } as never);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { status: "success", message: "The organisation is closed" };
  } catch (e) {
    return errorState(e);
  }
}

/** Reopen a closed organisation (Platform Administrator). */
export async function reopenOrganisationAction(orgId: string, reason: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("reopen_organisation" as never, { p_organisation_id: orgId, p_reason: reason } as never);
    if (error) throw error;
    revalidatePath("/admin", "layout");
    return { status: "success", message: "Organisation reopened" };
  } catch (e) {
    return errorState(e);
  }
}
