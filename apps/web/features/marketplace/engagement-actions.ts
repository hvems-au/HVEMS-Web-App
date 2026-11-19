"use server";
import { revalidatePath } from "next/cache";
import { engagementRpc, type EngagementRpc } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Thin wrappers: the database decides who may do what (each function checks the caller's side and status). */
async function run<T = unknown>(fn: EngagementRpc, args: Record<string, unknown>, message: string): Promise<ActionState<T>> {
  try {
    const db = await createSupabaseServerClient();
    const data = await engagementRpc<T>(db, fn, args);
    revalidatePath("/", "layout");
    return { status: "success", message, data };
  } catch (e) {
    return errorState(e);
  }
}

const id = (v: string) => z.string().uuid().parse(v);
const cents = (dollars: string | undefined) => {
  const v = (dollars ?? "").replace(/[^\d.]/g, "");
  return v ? Math.round(Number(v) * 100) : null;
};

export const acceptProposalAction = async (proposalId: string, followUpOf?: string) =>
  run<string>("accept_marketplace_proposal", { p_proposal_id: id(proposalId), p_follow_up_of: followUpOf || null }, "Proposal accepted: the engagement is confirmed");

export const assignTechnicianAction = async (engagementId: string, userId: string) =>
  run("assign_engagement_technician", { p_engagement_id: id(engagementId), p_user_id: userId || null }, "Technician assigned");

export const attendanceAction = async (engagementId: string, action: "acknowledge_safety" | "schedule" | "on_my_way" | "update_eta" | "on_site", minutes?: number, at?: string) =>
  run(
    "update_engagement_attendance",
    { p_engagement_id: id(engagementId), p_action: action, p_minutes: minutes ?? null, p_at: at ? new Date(at).toISOString() : null },
    {
      acknowledge_safety: "Safety information acknowledged",
      schedule: "Start time saved",
      on_my_way: "Customer told you're on the way",
      update_eta: "Arrival time updated",
      on_site: "Checked in on site",
    }[action],
  );

export const proposeVariationAction = async (engagementId: string, kind: "price" | "scope" | "timing", description: string, amountDollars?: string, date?: string) =>
  run(
    "propose_engagement_variation",
    { p_engagement_id: id(engagementId), p_kind: kind, p_description: description, p_new_amount_cents: cents(amountDollars), p_new_date: date || null },
    "Change proposed",
  );

export const decideVariationAction = async (variationId: string, accept: boolean) =>
  run("decide_engagement_variation", { p_variation_id: id(variationId), p_accept: accept }, accept ? "Change accepted" : "Change declined");

export const recordFindingAction = async (engagementId: string, severity: "critical" | "minor" | "advisory", title: string, description: string) =>
  run("record_engagement_finding", { p_engagement_id: id(engagementId), p_severity: severity, p_title: title, p_description: description || null }, "Finding recorded");

export const decideFindingAction = async (findingId: string, confirm: boolean) =>
  run("decide_engagement_finding", { p_finding_id: id(findingId), p_confirm: confirm }, confirm ? "Finding added to Defects" : "Finding dismissed");

export const submitCompletionAction = async (
  engagementId: string,
  input: { outcome: "complete" | "partial"; notes: string; parts?: string; remaining?: string; recommendations?: string; paths?: string[] },
) =>
  run(
    "submit_engagement_completion",
    {
      p_engagement_id: id(engagementId),
      p_outcome: input.outcome,
      p_notes: input.notes,
      p_parts: input.parts || null,
      p_remaining: input.remaining || null,
      p_recommendations: input.recommendations || null,
      p_paths: input.paths ?? [],
    },
    "Completion report sent",
  );

export const confirmCompletionAction = async (engagementId: string, confirm: boolean, reason?: string) =>
  run("confirm_engagement_completion", { p_engagement_id: id(engagementId), p_confirm: confirm, p_reason: reason || null }, confirm ? "Completion confirmed" : "Correction requested");

export const reportPaymentAction = async (engagementId: string, note: string) =>
  run("report_job_payment", { p_engagement_id: id(engagementId), p_note: note || null }, "Payment recorded as reported");

export const cancelEngagementAction = async (engagementId: string, category: string, reason: string) =>
  run("cancel_marketplace_engagement", { p_engagement_id: id(engagementId), p_category: category, p_reason: reason }, "Engagement cancelled");

export const reportNoShowAction = async (engagementId: string, note: string) =>
  run<string>("report_no_show", { p_engagement_id: id(engagementId), p_note: note || null }, "No-show reported: the provider has 48 hours to respond");

export const raiseCaseAction = async (engagementId: string, category: string, description: string) =>
  run<string>("raise_marketplace_case", { p_engagement_id: id(engagementId), p_category: category, p_description: description }, "Case raised");

export const respondCaseAction = async (caseId: string, response: string) =>
  run("respond_marketplace_case", { p_case_id: id(caseId), p_response: response }, "Response sent");

export const decideCaseAction = async (caseId: string, upheld: boolean, outcome: string) =>
  run("decide_marketplace_case", { p_case_id: id(caseId), p_upheld: upheld, p_outcome: outcome }, "Case decided");

export const reviewAction = async (engagementId: string, rating: number, comment: string) =>
  run("review_engagement", { p_engagement_id: id(engagementId), p_rating: rating, p_comment: comment || null }, "Thanks for your review");

export const replyReviewAction = async (engagementId: string, reply: string) =>
  run("reply_to_review", { p_engagement_id: id(engagementId), p_reply: reply }, "Reply posted");

export const removeReviewAction = async (engagementId: string, reason: string) =>
  run("remove_review", { p_engagement_id: id(engagementId), p_reason: reason }, "Review removed (kept for audit)");
