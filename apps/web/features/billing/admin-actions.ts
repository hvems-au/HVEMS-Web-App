"use server";
import { revalidatePath } from "next/cache";
import { toAppError } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Console refunds, credits and waiver adjustments (SoW §5.8). The database checks the
 * approver authority, the refundable amount and the second approval above the threshold;
 * once approved, the money moves straight away (or on the next billing dispatch).
 */

const schema = z.object({
  organisationId: z.string().uuid(),
  kind: z.enum(["refund", "credit", "waiver_restore"]),
  amount: z.string().optional(),
  quantity: z.coerce.number().int().optional(),
  reason: z.string().trim().min(3, "Give a reason").max(1000),
  invoiceId: z.string().uuid().optional(),
  engagementId: z.string().uuid().optional(),
  feeSide: z.enum(["poster", "provider"]).optional(),
});

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = await createSupabaseServerClient();
  const { data, error } = await (db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: Parameters<typeof toAppError>[0] | null }>)(fn, args);
  if (error) throw toAppError(error);
  return data;
}

/** Move the money now; if Stripe fails, the adjustment shows as failed with a Retry button. */
async function carryOut(id: string): Promise<string | null> {
  try {
    const { processAdjustments } = await import("./adjustments");
    const r = await processAdjustments(id);
    return r.failed ? (r.lastError ?? "Stripe didn't accept it") : null;
  } catch (e) {
    return (e as Error).message;
  }
}

export async function requestAdjustmentAction(input: z.input<typeof schema>): Promise<ActionState<{ status: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "validation", message: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;
  const cents = v.amount ? Math.round(Number(v.amount.replace(/[^\d.]/g, "")) * 100) : 0;
  try {
    const id = await rpc<string>("request_billing_adjustment", {
      p_organisation_id: v.organisationId,
      p_kind: v.kind,
      p_amount_cents: cents,
      p_reason: v.reason,
      p_invoice_id: v.invoiceId ?? null,
      p_engagement_id: v.engagementId ?? null,
      p_fee_side: v.feeSide ?? null,
      p_quantity: v.quantity ?? 0,
    });
    const db = await createSupabaseServerClient();
    const { data } = await db.from("billing_adjustments" as never).select("status").eq("id" as never, id as never).single();
    const status = (data as { status: string } | null)?.status ?? "approved";
    revalidatePath("/admin", "layout");
    if (status === "pending_approval") return { status: "success", message: "Sent for a second approval (over the limit)", data: { status } };
    if (status === "completed") return { status: "success", message: "Waivers added to this month", data: { status } };
    const failed = await carryOut(id);
    revalidatePath("/admin", "layout");
    if (failed) return { status: "error", code: "stripe_failed", message: `Recorded, but Stripe didn't accept it: ${failed}. Retry from Billing.` };
    return { status: "success", message: v.kind === "refund" ? "Refunded" : "Credit added", data: { status: "completed" } };
  } catch (e) {
    return errorState(e);
  }
}

export async function decideAdjustmentAction(id: string, approve: boolean, note?: string): Promise<ActionState> {
  try {
    await rpc("decide_billing_adjustment", { p_id: z.string().uuid().parse(id), p_approve: approve, p_note: note ?? null });
    if (!approve) {
      revalidatePath("/admin", "layout");
      return { status: "success", message: "Rejected" };
    }
    const failed = await carryOut(id);
    revalidatePath("/admin", "layout");
    if (failed) return { status: "error", code: "stripe_failed", message: `Approved, but Stripe didn't accept it: ${failed}. Retry below.` };
    return { status: "success", message: "Approved and carried out" };
  } catch (e) {
    return errorState(e);
  }
}

export async function retryAdjustmentAction(id: string): Promise<ActionState> {
  try {
    await rpc("retry_billing_adjustment", { p_id: z.string().uuid().parse(id) });
    const failed = await carryOut(id);
    revalidatePath("/admin", "layout");
    if (failed) return { status: "error", code: "stripe_failed", message: `Stripe didn't accept it: ${failed}` };
    return { status: "success", message: "Done" };
  } catch (e) {
    return errorState(e);
  }
}
