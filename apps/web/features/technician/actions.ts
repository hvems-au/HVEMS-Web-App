"use server";
import { revalidatePath } from "next/cache";
import { addWorkOrderFile, getWorkOrder, removeWorkOrderFile, submitWorkOrderReport, updateWorkOrderStatus } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const num = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null));
const reportSchema = z.object({
  notes: z.string().trim().min(3, "Add a short description (at least 3 characters)").max(4000),
  checks: z.record(z.string(), z.enum(["ok", "issue", "na"])).default({}),
  photos: z.array(z.string().max(300)).max(10).default([]),
  odometer_km: num,
  engine_hours: num,
});
const postSchema = reportSchema.extend({
  labour_hours: num,
  cost: num,
  next_due_on: z
    .string()
    .optional()
    .transform((s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)),
  next_due_km: num,
  next_due_hours: num,
});

function refresh(orgId: string, woId: string) {
  revalidatePath(`/customer/${orgId}/my-work`);
  revalidatePath(`/customer/${orgId}/my-work/${woId}`);
  revalidatePath(`/customer/${orgId}/work-orders/${woId}`);
  revalidatePath(`/customer/${orgId}/work-orders`);
  revalidatePath(`/customer/${orgId}/maintenance`);
}

/** Pre-work report; filing it also starts the job if it hasn't started. */
export async function submitPreReportAction(orgId: string, woId: string, input: unknown): Promise<ActionState> {
  const v = reportSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the report" };
  try {
    const db = await createSupabaseServerClient();
    await submitWorkOrderReport(db, {
      workOrderId: woId,
      kind: "pre",
      notes: v.data.notes,
      checks: v.data.checks,
      photos: v.data.photos,
      odometerKm: v.data.odometer_km,
      engineHours: v.data.engine_hours,
    });
    const w = await getWorkOrder(db, orgId, woId);
    if (w?.status === "open") await updateWorkOrderStatus(db, woId, "start");
    refresh(orgId, woId);
    return { status: "success", message: w?.status === "open" ? "Pre-work report saved · job started" : "Pre-work report saved" };
  } catch (e) {
    return errorState(e);
  }
}

/** Post-work report (with the next service due), then mark the job complete for review. */
export async function submitPostAndCompleteAction(orgId: string, woId: string, input: unknown): Promise<ActionState> {
  const v = postSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the report" };
  try {
    const db = await createSupabaseServerClient();
    await submitWorkOrderReport(db, {
      workOrderId: woId,
      kind: "post",
      notes: v.data.notes,
      checks: v.data.checks,
      photos: v.data.photos,
      odometerKm: v.data.odometer_km,
      engineHours: v.data.engine_hours,
      nextDueOn: v.data.next_due_on,
      nextDueKm: v.data.next_due_km,
      nextDueHours: v.data.next_due_hours,
    });
    const w = await getWorkOrder(db, orgId, woId);
    if (w?.status === "in_progress") {
      await updateWorkOrderStatus(db, woId, "complete", {
        notes: v.data.notes,
        odometer_km: v.data.odometer_km,
        engine_hours: v.data.engine_hours,
        labour_hours: v.data.labour_hours,
        // Dollars on screen, cents in the database.
        cost_cents: v.data.cost === null ? null : Math.round(v.data.cost * 100),
      });
    }
    refresh(orgId, woId);
    return { status: "success", message: w?.status === "in_progress" ? "Job completed · sent for review" : "Post-work report updated" };
  } catch (e) {
    return errorState(e);
  }
}

const fileSchema = z.object({
  kind: z.enum(["invoice", "receipt", "quote", "photo", "other"]),
  path: z.string().min(3).max(400),
  fileName: z.string().trim().min(1).max(200),
  supplier: z.string().trim().max(160).optional(),
  reference: z.string().trim().max(80).optional(),
  amount: num,
});

/** Record a document the browser has just uploaded to this job's folder. */
export async function addJobFileAction(orgId: string, woId: string, input: unknown): Promise<ActionState> {
  const v = fileSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the document details" };
  try {
    const db = await createSupabaseServerClient();
    await addWorkOrderFile(db, {
      workOrderId: woId,
      kind: v.data.kind,
      path: v.data.path,
      fileName: v.data.fileName,
      supplier: v.data.supplier || null,
      reference: v.data.reference || null,
      amountCents: v.data.amount === null ? null : Math.round(v.data.amount * 100),
    });
    refresh(orgId, woId);
    return { status: "success", message: "Document added" };
  } catch (e) {
    return errorState(e);
  }
}

export async function removeJobFileAction(orgId: string, woId: string, fileId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await removeWorkOrderFile(db, fileId);
    refresh(orgId, woId);
    return { status: "success", message: "Document removed" };
  } catch (e) {
    return errorState(e);
  }
}

/** Take an unassigned job (starting it assigns it to you). */
export async function startJobAction(orgId: string, woId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await updateWorkOrderStatus(db, woId, "start");
    refresh(orgId, woId);
    return { status: "success", message: "Job started" };
  } catch (e) {
    return errorState(e);
  }
}
