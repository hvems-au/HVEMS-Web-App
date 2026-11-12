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

/**
 * Review several missed pre-starts at once with the same outcome and note. Each
 * one still goes through the database rule (permissions, note required for
 * "missed", already reviewed); failures are reported, the rest are saved.
 */
export async function reviewMissedPrestartsBulkAction(
  orgId: string,
  ids: string[],
  outcome: "not_used" | "missed",
  note: string,
): Promise<ActionState<{ saved: number; failed: number }>> {
  if (!ids.length || ids.length > 200) return { status: "error", code: "invalid", message: "Choose between 1 and 200 to review" };
  if (outcome === "missed" && note.trim().length < 3) return { status: "error", code: "note_required", message: "Say what happened and what was done about it" };
  try {
    const db = await createSupabaseServerClient();
    let saved = 0;
    let firstError: unknown = null;
    for (const id of ids) {
      try {
        await reviewMissedPrestart(db, id, outcome, note.trim() || undefined);
        saved++;
      } catch (e) {
        firstError ??= e;
      }
    }
    revalidatePath(`/customer/${orgId}/inspections`);
    if (!saved && firstError) return errorState(firstError);
    return { status: "success", data: { saved, failed: ids.length - saved } };
  } catch (e) {
    return errorState(e);
  }
}
