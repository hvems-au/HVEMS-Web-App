"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ maintenance: z.boolean(), marketplace: z.boolean() });

/** Save the signed-in person's email preferences. Safety and account emails can't be turned off (the database ignores them). */
export async function saveEmailPreferencesAction(input: { maintenance: boolean; marketplace: boolean }): Promise<ActionState> {
  const v = schema.safeParse(input);
  if (!v.success) return { status: "error", code: "validation", message: "Choose your email preferences" };
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("set_notification_preferences" as never, { p_maintenance: v.data.maintenance, p_marketplace: v.data.marketplace } as never);
    if (error) throw error;
    revalidatePath("/account/notifications");
    return { status: "success", message: "Email preferences saved" };
  } catch (e) {
    return errorState(e);
  }
}
