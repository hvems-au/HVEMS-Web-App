"use server";
import { revalidatePath } from "next/cache";
import { partsRpc, saveCatalogueItem, savePartsRequest, saveSupplier } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const money = z
  .union([z.literal(""), z.coerce.number().min(0).max(10_000_000)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : Math.round(v * 100)));
const date = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .optional()
  .transform((v) => (v ? v : null));
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

function refresh(orgId: string) {
  revalidatePath(`/customer/${orgId}`, "layout");
}

const lineSchema = z.object({
  description: z.string().trim().min(2, "Describe each part").max(200),
  part_number: optText(80),
  specification: optText(1000),
  quantity: z.coerce.number().positive("Each line needs a quantity").max(100000),
  unit: z.string().trim().min(1).max(20).default("each"),
  est_unit_cost: z.coerce.number({ message: "Each line needs an estimated price" }).min(0).max(10_000_000),
  catalogue_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  preferred_supplier_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  photo_paths: z.array(z.string().max(300)).max(5).default([]),
});
const requestSchema = z.object({
  requestId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  assetId: z.string().uuid("Choose the equipment"),
  workOrderId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  urgency: z.enum(["normal", "urgent"]),
  neededBy: date,
  siteId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  notes: optText(2000),
  lines: z.array(lineSchema).min(1, "Add at least one part").max(50),
  submit: z.boolean(),
});

/** Save a draft or submit (approved automatically within the requester's limit). */
export async function savePartsRequestAction(orgId: string, input: unknown): Promise<ActionState<{ id: string; status: string; auto: boolean }>> {
  const v = requestSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the request" };
  try {
    const db = await createSupabaseServerClient();
    const res = await savePartsRequest(db, {
      organisationId: orgId,
      ...v.data,
      lines: v.data.lines.map(({ est_unit_cost, ...l }) => ({ ...l, est_unit_cost_cents: Math.round(est_unit_cost * 100) })),
    });
    refresh(orgId);
    const message = !v.data.submit ? "Draft saved" : res.auto_approved ? "Submitted and approved (within your limit)" : "Submitted for approval";
    return { status: "success", message, data: { id: res.id, status: res.status, auto: !!res.auto_approved } };
  } catch (e) {
    return errorState(e);
  }
}

async function run(orgId: string, fn: Parameters<typeof partsRpc>[1], args: Record<string, unknown>, message: string): Promise<ActionState<unknown>> {
  try {
    const db = await createSupabaseServerClient();
    const data = await partsRpc(db, fn, args);
    refresh(orgId);
    return { status: "success", message, data };
  } catch (e) {
    return errorState(e);
  }
}

export async function submitPartsRequestAction(orgId: string, id: string) {
  return run(orgId, "submit_parts_request", { p_request_id: id }, "Submitted");
}

export async function decidePartsRequestAction(orgId: string, id: string, approve: boolean, reason: string) {
  return run(orgId, "decide_parts_request", { p_request_id: id, p_approve: approve, p_reason: reason || null }, approve ? "Approved" : "Rejected");
}

export async function cancelPartsRequestAction(orgId: string, id: string, reason: string) {
  return run(orgId, "cancel_parts_request", { p_request_id: id, p_reason: reason }, "Request cancelled");
}

const orderSchema = z.object({
  lineId: z.string().uuid(),
  supplierId: z.string().uuid("Choose the supplier"),
  orderRef: z.string().trim().min(1, "Enter the order reference").max(80),
  orderedOn: date,
  expectedOn: date,
  actualUnitCost: money,
});

/** Record the order for a line; more than 10% over the approved price goes back for approval. */
export async function recordPartsOrderAction(orgId: string, input: unknown): Promise<ActionState<unknown>> {
  const v = orderSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the order" };
  if (v.data.actualUnitCost === null) return { status: "error", code: "price_required", message: "Enter the actual unit price" };
  const res = await run(
    orgId,
    "record_parts_order",
    {
      p_line_id: v.data.lineId,
      p_supplier_id: v.data.supplierId,
      p_order_ref: v.data.orderRef,
      p_ordered_on: v.data.orderedOn,
      p_expected_on: v.data.expectedOn,
      p_actual_unit_cost_cents: v.data.actualUnitCost,
    },
    "Order recorded",
  );
  if (res.status === "success" && (res.data as { reapproval?: boolean } | undefined)?.reapproval) {
    return { status: "success", message: "Order recorded. The price is more than 10% over, so it's gone back for approval.", data: res.data };
  }
  return res;
}

const receiveSchema = z.object({
  lineId: z.string().uuid(),
  kind: z.enum(["receipt", "return_to_supplier"]),
  quantity: z.coerce.number().positive("Enter a quantity"),
  receivedOn: date,
  substituteReason: optText(1000),
  returnReason: optText(1000),
  notePaths: z.array(z.string().max(300)).max(5).default([]),
});

export async function receivePartsAction(orgId: string, input: unknown): Promise<ActionState<unknown>> {
  const v = receiveSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the delivery" };
  return run(
    orgId,
    "receive_parts",
    {
      p_line_id: v.data.lineId,
      p_kind: v.data.kind,
      p_quantity: v.data.quantity,
      p_received_on: v.data.receivedOn,
      p_substitute_reason: v.data.substituteReason,
      p_return_reason: v.data.returnReason,
      p_note_paths: v.data.notePaths,
    },
    v.data.kind === "receipt" ? "Received" : "Returned to the supplier",
  );
}

const fitSchema = z.object({
  workOrderId: z.string().uuid(),
  lineId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  quantity: z.coerce.number().positive("Enter a quantity"),
  description: optText(200),
  unitCost: money,
  supplierName: optText(160),
});

/** Fit parts to a work order: from a received request line, or bought on the spot. */
export async function fitPartsAction(orgId: string, input: unknown): Promise<ActionState<unknown>> {
  const v = fitSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the part" };
  return run(
    orgId,
    "fit_parts",
    {
      p_work_order_id: v.data.workOrderId,
      p_line_id: v.data.lineId,
      p_quantity: v.data.quantity,
      p_description: v.data.description,
      p_unit_cost_cents: v.data.unitCost,
      p_supplier_name: v.data.supplierName,
    },
    "Part recorded on the job",
  );
}

export async function returnFittedPartAction(orgId: string, usageId: string, reason: string) {
  return run(orgId, "return_fitted_part", { p_usage_id: usageId, p_reason: reason }, "Part returned from the job");
}

const supplierSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  name: z.string().trim().min(2, "Enter the supplier's name").max(160),
  abn: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => v === "" || /^\d{11}$/.test(v), "An ABN has 11 digits")
    .transform((v) => v || null),
  contact_name: optText(120),
  email: optText(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9 +()-]*$/, "Use digits, spaces, + ( ) or -")
    .transform((v) => v || null),
  account_number: optText(60),
  notes: optText(2000),
  archived: z.boolean().default(false),
});

export async function saveSupplierAction(orgId: string, input: unknown): Promise<ActionState> {
  const v = supplierSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the supplier" };
  try {
    const db = await createSupabaseServerClient();
    const { id, archived, ...values } = v.data;
    await saveSupplier(db, orgId, id, values, archived);
    refresh(orgId);
    return { status: "success", message: archived ? "Supplier archived" : "Supplier saved" };
  } catch (e) {
    return errorState(e);
  }
}

const catalogueSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  part_number: optText(80),
  description: z.string().trim().min(2, "Describe the part").max(200),
  unit: z.string().trim().min(1).max(20).default("each"),
  default_unit_cost: money,
  supplier_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  archived: z.boolean().default(false),
});

export async function saveCatalogueItemAction(orgId: string, input: unknown): Promise<ActionState> {
  const v = catalogueSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the part" };
  try {
    const db = await createSupabaseServerClient();
    const { id, archived, default_unit_cost, ...rest } = v.data;
    await saveCatalogueItem(db, orgId, id, { ...rest, default_unit_cost_cents: default_unit_cost }, archived);
    refresh(orgId);
    return { status: "success", message: archived ? "Part archived" : "Part saved" };
  } catch (e) {
    return errorState(e);
  }
}
