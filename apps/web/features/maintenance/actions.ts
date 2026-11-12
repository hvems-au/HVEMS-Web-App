"use server";
import { revalidatePath } from "next/cache";
import { createServicePlan, createWorkOrder, setServicePlanActive, setWorkOrderRequirement, updateWorkOrderStatus, type WorkOrderAction } from "@hvems/api-client";
import { REQUIRABLE_QUALIFICATIONS } from "@hvems/domain";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const num = (max: number) =>
  z
    .union([z.literal(""), z.coerce.number().positive().max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));
const date = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .optional()
  .transform((v) => (v ? v : null));

const planSchema = z
  .object({
    asset_id: z.string().uuid("Choose the equipment"),
    name: z.string().trim().min(2, "Name the service").max(120),
    interval_days: num(3650),
    interval_km: num(1_000_000),
    interval_hours: num(100_000),
    last_done_on: date,
    last_done_km: num(10_000_000),
    last_done_hours: num(1_000_000),
    notes: z.string().trim().max(2000).optional().transform((v) => v || null),
  })
  .refine((v) => v.interval_days || v.interval_km || v.interval_hours, { path: ["interval_days"], message: "Set at least one interval (days, km or hours)" });

function paths(orgId: string) {
  revalidatePath(`/customer/${orgId}/maintenance`);
  revalidatePath(`/customer/${orgId}/work-orders`);
}

export async function createServicePlanAction(orgId: string, input: unknown): Promise<ActionState> {
  const v = planSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the details" };
  try {
    const db = await createSupabaseServerClient();
    await createServicePlan(db, orgId, { ...v.data, interval_days: v.data.interval_days ? Math.round(v.data.interval_days) : null });
    paths(orgId);
    return { status: "success", message: "Service plan added" };
  } catch (e) {
    return errorState(e);
  }
}

export async function setServicePlanActiveAction(orgId: string, id: string, active: boolean): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await setServicePlanActive(db, orgId, id, active);
    paths(orgId);
    return { status: "success", message: active ? "Plan switched on" : "Plan removed from the schedule" };
  } catch (e) {
    return errorState(e);
  }
}

const woSchema = z
  .object({
    asset_id: z.string().uuid("Choose the equipment"),
    title: z.string().trim().min(3, "Give the work order a title").max(160),
    description: z.string().trim().max(4000).optional(),
    kind: z.enum(["internal", "vendor"]),
    vendor_name: z.string().trim().max(160).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    assigned_to: z.union([z.literal(""), z.string().uuid()]).optional(),
    due_on: date,
    service_plan_id: z.union([z.literal(""), z.string().uuid()]).optional(),
    required_qualification: z.union([z.literal(""), z.enum(REQUIRABLE_QUALIFICATIONS as [string, ...string[]])]).optional(),
  })
  .refine((v) => v.kind !== "vendor" || (v.vendor_name ?? "").length > 0, { path: ["vendor_name"], message: "Name the vendor" });

export async function createWorkOrderAction(orgId: string, input: unknown): Promise<ActionState<{ id: string }>> {
  const v = woSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the details" };
  try {
    const db = await createSupabaseServerClient();
    const res = await createWorkOrder(db, orgId, {
      ...v.data,
      description: v.data.description || null,
      vendor_name: v.data.kind === "vendor" ? v.data.vendor_name : null,
      assigned_to: v.data.assigned_to || null,
      service_plan_id: v.data.service_plan_id || null,
    });
    // The qualification it needs; the database records any allocation warnings.
    if (v.data.required_qualification) await setWorkOrderRequirement(db, res.id, v.data.required_qualification);
    paths(orgId);
    return { status: "success", message: "Work order created", data: { id: res.id } };
  } catch (e) {
    return errorState(e);
  }
}

export async function workOrderStatusAction(
  orgId: string,
  id: string,
  action: WorkOrderAction,
  extra: { notes?: string; odometer_km?: string; engine_hours?: string; labour_hours?: string; cost?: string } = {},
): Promise<ActionState> {
  const n = (s?: string) => (s && s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);
  const cost = n(extra.cost);
  try {
    const db = await createSupabaseServerClient();
    await updateWorkOrderStatus(db, id, action, {
      notes: extra.notes,
      odometer_km: n(extra.odometer_km),
      engine_hours: n(extra.engine_hours),
      labour_hours: n(extra.labour_hours),
      // Dollars on screen, cents in the database.
      cost_cents: cost === null ? null : Math.round(cost * 100),
    });
    paths(orgId);
    revalidatePath(`/customer/${orgId}/work-orders/${id}`);
    const done: Record<WorkOrderAction, string> = { start: "Work started", complete: "Marked complete", close: "Closed", reopen: "Reopened", cancel: "Cancelled" };
    return { status: "success", message: done[action] };
  } catch (e) {
    return errorState(e);
  }
}
