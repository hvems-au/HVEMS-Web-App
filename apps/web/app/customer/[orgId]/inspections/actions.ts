"use server";
import { revalidatePath } from "next/cache";
import { reviewMissedPrestart } from "@hvems/api-client";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Managers (inspections.review) mark a missed pre-start as not used or missed; the database checks and audits it. */
export async function reviewMissedPrestartAction(orgId: string, id: string, outcome: "not_used" | "missed", note: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await reviewMissedPrestart(db, id, outcome, note.trim() || undefined);
    revalidatePath(`/customer/${orgId}/inspections`);
    return { status: "success", message: "Review saved" };
  } catch (e) {
    return errorState(e);
  }
}
