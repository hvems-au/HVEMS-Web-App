"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  archiveAsset,
  createAsset,
  importAssets,
  listAssetClasses,
  recordMeterReading,
  updateAsset,
} from "@hvems/api-client";
import type { ImportResult } from "@hvems/types";
import { archiveAssetSchema, assetFormSchema, meterReadingSchema, type AssetFormInput } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function classIdFor(code: string) {
  const db = await createSupabaseServerClient();
  const classes = await listAssetClasses(db);
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
    const { db, classId } = await classIdFor(parsed.data.asset_class);
    const asset = assetId ? await updateAsset(db, assetId, classId, parsed.data) : await createAsset(db, orgId, classId, parsed.data, randomUUID());
    revalidatePath(`/customer/${orgId}/equipment`);
    revalidatePath(`/customer/${orgId}/dashboard`);
    return { status: "success", message: assetId ? "Equipment updated" : "Equipment added", data: { id: asset.id } };
  } catch (e) {
    return errorState(e);
  }
}

export async function archiveAssetAction(orgId: string, assetId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = archiveAssetSchema.safeParse({
    reason: form.get("reason"),
    effective_date: form.get("effective_date"),
    disposal: form.get("disposal") ?? "retired",
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
