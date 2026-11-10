"use server";
import { revalidatePath } from "next/cache";
import {
  acknowledgeAlert,
  clearDefect,
  clearRegulatorNotice,
  deferDefect,
  dismissDefect,
  mergeDefect,
  placeHold,
  recordRegulatorNotice,
  removeHold,
  reportBreakdown,
  resolveBreakdown,
  returnToService,
  triageDefect,
} from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Thin wrappers over the defect workflow RPCs (O-09). The database checks the
 * role, reasons, evidence, the deferral limit and the repairer rule; these
 * actions only validate shapes and refresh the affected pages.
 */
const paths = z.array(z.string().min(10).max(400)).max(10).default([]);
const reason = z.string().trim().max(2000);

function refresh(orgId: string, assetId?: string) {
  revalidatePath(`/customer/${orgId}`, "layout");
  if (assetId) revalidatePath(`/customer/${orgId}/equipment/${assetId}`);
}

async function run(orgId: string, assetId: string | undefined, message: string, fn: () => Promise<unknown>): Promise<ActionState> {
  try {
    await fn();
    refresh(orgId, assetId);
    return { status: "success", message };
  } catch (e) {
    return errorState(e);
  }
}

export async function triageDefectAction(
  orgId: string,
  assetId: string,
  input: { defectId: string; severity: string; reason?: string; evidence?: string[] },
): Promise<ActionState> {
  const v = z.object({ defectId: z.string().uuid(), severity: z.enum(["critical", "minor", "advisory"]), reason: reason.optional(), evidence: paths }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Defect triaged", () => triageDefect(db, v));
}

export async function dismissDefectAction(orgId: string, assetId: string, input: { defectId: string; reason: string }): Promise<ActionState> {
  const v = z.object({ defectId: z.string().uuid(), reason }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Defect dismissed", () => dismissDefect(db, v.defectId, v.reason));
}

export async function mergeDefectAction(orgId: string, assetId: string, input: { defectId: string; intoId: string; reason?: string }): Promise<ActionState> {
  const v = z.object({ defectId: z.string().uuid(), intoId: z.string().uuid(), reason: reason.optional() }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Defect merged", () => mergeDefect(db, v.defectId, v.intoId, v.reason));
}

export async function deferDefectAction(orgId: string, assetId: string, input: { defectId: string; newDue: string; reason: string }): Promise<ActionState> {
  const v = z.object({ defectId: z.string().uuid(), newDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"), reason }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Repair deferred", () => deferDefect(db, v.defectId, v.newDue, v.reason));
}

export async function clearDefectAction(
  orgId: string,
  assetId: string,
  input: { defectId: string; repairDetails: string; repairedBy?: string; evidence?: string[] },
): Promise<ActionState<{ awaiting: boolean }>> {
  const v = z
    .object({ defectId: z.string().uuid(), repairDetails: reason, repairedBy: z.string().uuid().optional().or(z.literal("")), evidence: paths })
    .parse(input);
  try {
    const db = await createSupabaseServerClient();
    const res = await clearDefect(db, { defectId: v.defectId, repairDetails: v.repairDetails, repairedBy: v.repairedBy || null, evidence: v.evidence });
    refresh(orgId, assetId);
    return {
      status: "success",
      message: res.awaiting_return_to_service ? "Repair recorded. The equipment is waiting to return to service." : "Defect marked repaired",
      data: { awaiting: res.awaiting_return_to_service },
    };
  } catch (e) {
    return errorState(e);
  }
}

export async function returnToServiceAction(orgId: string, assetId: string, input: { note: string; evidence?: string[] }): Promise<ActionState> {
  const v = z.object({ note: reason, evidence: paths }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Returned to service", () => returnToService(db, assetId, v.note, v.evidence));
}

// ------------------------------------------------- holds, breakdowns, notices, alerts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export async function placeHoldAction(orgId: string, assetId: string, input: { kind: string; reason: string }): Promise<ActionState> {
  const v = z.object({ kind: z.enum(["out_of_service", "needs_attention"]), reason }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Hold placed", () => placeHold(db, assetId, v.kind, v.reason));
}

export async function removeHoldAction(orgId: string, assetId: string, input: { holdId: string; note: string }): Promise<ActionState> {
  const v = z.object({ holdId: z.string().uuid(), note: reason }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Hold removed", () => removeHold(db, v.holdId, v.note));
}

export async function reportBreakdownAction(
  orgId: string,
  assetId: string,
  input: { description: string; location?: string; evidence?: string[] },
): Promise<ActionState> {
  const v = z.object({ description: reason, location: z.string().trim().max(300).optional(), evidence: paths }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Breakdown reported. The Owner and Fleet Managers have been alerted.", () => reportBreakdown(db, { assetId, ...v }));
}

export async function resolveBreakdownAction(orgId: string, assetId: string, input: { breakdownId: string; resolution: string; evidence?: string[] }): Promise<ActionState> {
  const v = z.object({ breakdownId: z.string().uuid(), resolution: reason, evidence: paths }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Breakdown resolved. Return the equipment to service when it's fit to use.", () =>
    resolveBreakdown(db, v.breakdownId, v.resolution, v.evidence),
  );
}

export async function recordNoticeAction(
  orgId: string,
  assetId: string,
  input: { authority: string; severity: string; issuedOn: string; details: string; noticeNumber?: string; clearBy?: string; evidence?: string[] },
): Promise<ActionState> {
  const v = z
    .object({
      authority: z.string().trim().min(2, "Enter the authority").max(120),
      severity: z.enum(["major", "minor", "self_clearing"]),
      issuedOn: isoDate,
      details: reason,
      noticeNumber: z.string().trim().max(60).optional(),
      clearBy: isoDate.optional().or(z.literal("")),
      evidence: paths,
    })
    .parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Defect notice recorded", () => recordRegulatorNotice(db, { assetId, ...v, clearBy: v.clearBy || undefined }));
}

export async function clearNoticeAction(
  orgId: string,
  assetId: string,
  input: { noticeId: string; clearedOn: string; reference: string; evidence?: string[] },
): Promise<ActionState> {
  const v = z.object({ noticeId: z.string().uuid(), clearedOn: isoDate, reference: reason, evidence: paths }).parse(input);
  const db = await createSupabaseServerClient();
  return run(orgId, assetId, "Defect notice cleared", () => clearRegulatorNotice(db, v.noticeId, v.clearedOn, v.reference, v.evidence));
}

export async function acknowledgeAlertAction(orgId: string, alertId: string): Promise<ActionState> {
  const id = z.string().uuid().parse(alertId);
  const db = await createSupabaseServerClient();
  return run(orgId, undefined, "Alert acknowledged", () => acknowledgeAlert(db, id));
}
