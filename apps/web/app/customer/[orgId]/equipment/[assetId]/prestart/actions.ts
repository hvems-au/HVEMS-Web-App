"use server";
import { revalidatePath } from "next/cache";
import { AppError, submitPrestart, toAppError } from "@hvems/api-client";
import { prestartSchema, type PrestartInput } from "@hvems/validation";
import type { PrestartSubmitResult } from "@hvems/types";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Thin wrapper over submit_prestart: the database checks permission, every
 * answer, meter rules, raises defects and notifies managers. Per-item errors
 * come back keyed "item:<code>" so the form can mark each question.
 */
export async function submitPrestartAction(orgId: string, assetId: string, input: PrestartInput): Promise<ActionState<PrestartSubmitResult>> {
  const parsed = prestartSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", code: "invalid", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;
  try {
    const db = await createSupabaseServerClient();
    const result = await submitPrestart(db, {
      assetId,
      answers: v.answers,
      odometerKm: v.odometer_km ?? null,
      engineHours: v.engine_hours ?? null,
      notes: v.notes,
      photos: v.photos,
      declaration: v.declaration,
      clientRequestId: v.client_request_id,
      confirmJump: v.confirm_jump,
      lowerReadingReason: v.lower_reading_reason,
    });
    revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success", data: result };
  } catch (e) {
    const err = e instanceof AppError ? e : toAppError(e as Error);
    if (err.code === "checklist_incomplete" && Array.isArray(err.details?.errors)) {
      const fieldErrors: Record<string, string> = {};
      for (const item of err.details.errors as { item_code?: string | null; field?: string; message?: string }[]) {
        const key = item.item_code ? `item:${item.item_code}` : (item.field ?? "form");
        if (item.message && !fieldErrors[key]) fieldErrors[key] = item.message;
      }
      return { status: "error", code: err.code, message: "Some items need your attention.", fieldErrors };
    }
    return errorState(err);
  }
}
