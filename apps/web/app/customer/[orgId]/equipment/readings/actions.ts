"use server";
import { revalidatePath } from "next/cache";
import { decideMeterReading } from "@hvems/api-client";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Approve or reject a reading awaiting a manager (meter_readings.accept; the database checks it). */
export async function decideReadingAction(orgId: string, readingId: string, accept: boolean, note: string): Promise<ActionState> {
  if (!accept && note.trim().length < 3) return { status: "error", code: "note_required", message: "Say why it's rejected" };
  try {
    const db = await createSupabaseServerClient();
    await decideMeterReading(db, readingId, accept, note.trim() || null);
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success", message: accept ? "Reading approved" : "Reading rejected" };
  } catch (e) {
    return errorState(e);
  }
}
