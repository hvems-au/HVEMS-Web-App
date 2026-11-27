"use server";
import { revalidatePath } from "next/cache";
import { markNotificationsRead } from "@hvems/api-client";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function markAllReadAction(orgId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await markNotificationsRead(db);
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success" };
  } catch (e) {
    return errorState(e);
  }
}
