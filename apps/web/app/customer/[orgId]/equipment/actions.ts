"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  archiveAsset,
  createAsset,
  createAssetClass,
  importAssets,
  listAssetClasses,
  recordMeterReading,
  updateAsset,
} from "@hvems/api-client";
import type { AssetClass, ImportResult } from "@hvems/types";
import { archiveAssetSchema, assetClassSchema, assetFormSchema, meterReadingSchema, type AssetFormInput } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function classIdFor(orgId: string, code: string) {
  const db = await createSupabaseServerClient();
  // Standard classes plus this company's own (O-03); the database re-checks the scope.
  const classes = await listAssetClasses(db, orgId);
  const cls = classes.find((c) => c.code === code);
  if (!cls) throw new Error("Unknown asset class");
  return { db, classId: cls.id };
}

export async function saveAssetAction(
  orgId: string,
  assetId: string | null,
  input: AssetFormInput,
): Promise<ActionState<{ id: string }>> {
  const parsed = assetFormSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const { db, classId } = await classIdFor(orgId, parsed.data.asset_class);
    const asset = assetId ? await updateAsset(db, assetId, classId, parsed.data) : await createAsset(db, orgId, classId, parsed.data, randomUUID());
    revalidatePath(`/customer/${orgId}/equipment`);
    revalidatePath(`/customer/${orgId}/dashboard`);
    return { status: "success", message: assetId ? "Equipment updated" : "Equipment added", data: { id: asset.id } };
  } catch (e) {
    return errorState(e);
  }
}

/** Create a company asset class from the equipment form; it's saved for the company's future equipment. */
export async function createAssetClassAction(orgId: string, input: unknown): Promise<ActionState<AssetClass>> {
  const parsed = assetClassSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the class details.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    const cls = await createAssetClass(db, orgId, parsed.data);
    revalidatePath(`/customer/${orgId}/equipment/new`);
    return { status: "success", message: `Class “${cls.name}” added and saved for your company`, data: cls };
  } catch (e) {
    return errorState(e);
  }
}

export async function archiveAssetAction(orgId: string, assetId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = archiveAssetSchema.safeParse({
    reason: form.get("reason"),
    effective_date: form.get("effective_date"),
    disposal: form.get("disposal") ?? "disposed",
    open_issues_acknowledged: form.get("open_issues_acknowledged") === "on",
  });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await archiveAsset(db, assetId, parsed.data);
    revalidatePath(`/customer/${orgId}/equipment`);
    revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
    return { status: "success", message: "Equipment archived. Its history is kept." };
  } catch (e) {
    return errorState(e);
  }
}

export async function recordMeterReadingAction(orgId: string, assetId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = meterReadingSchema.safeParse({
    unit: form.get("unit"),
    value: form.get("value"),
    lower_reason: form.get("lower_reason") ?? undefined,
    confirm_jump: form.get("confirm_jump") === "on",
    client_request_id: form.get("client_request_id") || undefined,
    add_meter: form.get("add_meter") === "on",
  });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the reading.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    const reading = await recordMeterReading(db, {
      assetId,
      unit: parsed.data.unit,
      value: parsed.data.value,
      clientRequestId: parsed.data.client_request_id,
      lowerReason: parsed.data.lower_reason,
      confirmJump: parsed.data.confirm_jump,
      addMeter: parsed.data.add_meter,
    });
    revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
    return {
      status: "success",
      message: reading.status === "pending_acceptance" ? "Reading saved. A manager must accept it before it becomes current." : "Reading recorded.",
    };
  } catch (e) {
    return errorState(e);
  }
}

/** What happened to each unit, so the form can show the right follow-up beside the right box. */
export type ReadingsResult =
  | { status: "idle" }
  | { status: "success"; message: string; recorded: ("km" | "hours")[] }
  | { status: "error"; code: string; message: string; unit?: "km" | "hours"; recorded: ("km" | "hours")[] };

/**
 * Odometer and hour meter side by side: each filled box is saved as its own
 * reading with its own request id (retries never double-record), using the same
 * rules as a single reading. Stops at the first unit that needs attention.
 */
export async function recordReadingsAction(orgId: string, assetId: string, _prev: ReadingsResult, form: FormData): Promise<ReadingsResult> {
  const units = (["km", "hours"] as const).filter((u) => String(form.get(`value_${u}`) ?? "").trim() !== "");
  if (units.length === 0) return { status: "error", code: "invalid", message: "Enter an odometer or hour meter reading.", recorded: [] };
  const db = await createSupabaseServerClient();
  const recorded: ("km" | "hours")[] = [];
  let pending = false;
  for (const unit of units) {
    const parsed = meterReadingSchema.safeParse({
      unit,
      value: form.get(`value_${unit}`),
      lower_reason: form.get(`lower_reason_${unit}`) ?? undefined,
      confirm_jump: form.get(`confirm_jump_${unit}`) === "on",
      client_request_id: form.get(`client_request_id_${unit}`) || undefined,
      add_meter: form.get(`add_meter_${unit}`) === "on",
    });
    if (!parsed.success) {
      return { status: "error", code: "invalid", message: parsed.error.issues[0]?.message ?? "Check the reading.", unit, recorded };
    }
    try {
      const reading = await recordMeterReading(db, {
        assetId,
        unit,
        value: parsed.data.value,
        clientRequestId: parsed.data.client_request_id,
        lowerReason: parsed.data.lower_reason,
        confirmJump: parsed.data.confirm_jump,
        addMeter: parsed.data.add_meter,
      });
      recorded.push(unit);
      if (reading.status === "pending_acceptance") pending = true;
    } catch (e) {
      const err = errorState(e);
      revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
      return { status: "error", code: err.status === "error" ? err.code : "error", message: err.status === "error" ? err.message : "Something went wrong.", unit, recorded };
    }
  }
  revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
  const what = recorded.length === 2 ? "Odometer and hour meter readings" : recorded[0] === "km" ? "Odometer reading" : "Hour meter reading";
  return {
    status: "success",
    message: pending ? `${what} saved. A manager must accept them before they become current.` : `${what} recorded.`,
    recorded,
  };
}

export async function importAssetsAction(orgId: string, rows: Record<string, string>[], dryRun: boolean): Promise<ActionState<ImportResult>> {
  try {
    const db = await createSupabaseServerClient();
    const result = await importAssets(db, orgId, rows, dryRun);
    if (!dryRun && result.created > 0) {
      revalidatePath(`/customer/${orgId}/equipment`);
      revalidatePath(`/customer/${orgId}/dashboard`);
    }
    return { status: "success", data: result };
  } catch (e) {
    return errorState(e);
  }
}
