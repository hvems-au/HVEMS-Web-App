"use server";
import { revalidatePath } from "next/cache";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The database checks the Platform Administrator role, the value's type and the reason, and records the history. */
export async function setPlatformSettingAction(key: string, value: unknown, reason: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("set_platform_setting" as never, { p_key: key, p_value: value, p_reason: reason } as never);
    if (error) throw error;
    revalidatePath("/admin/settings");
    return { status: "success", message: "Setting changed" };
  } catch (e) {
    return errorState(e);
  }
}
