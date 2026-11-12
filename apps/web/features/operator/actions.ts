"use server";
import { revalidatePath } from "next/cache";
import { toAppError, type HvemsClient } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const issueSchema = z.object({
  summary: z.string().trim().min(3, "Say in a few words what the issue is").max(200),
  description: z.string().trim().max(4000).optional(),
  urgency: z.enum(["stop", "soon", "not_urgent"], { message: "Say whether it is safe to keep using" }),
  evidence: z.array(z.string().max(300)).max(5).default([]),
  requestId: z.string().uuid(),
});

/**
 * Report an issue on a vehicle or machine (no pre-start needed). The database
 * checks access, records it in the company's defect workflow, takes the
 * equipment out of service if the operator says it's unsafe, alerts managers,
 * and returns the same record if this request is retried.
 */
export async function reportIssueAction(orgId: string, assetId: string, input: unknown): Promise<ActionState<{ id: string }>> {
  const v = issueSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the details" };
  if (v.data.urgency === "stop" && (v.data.description ?? "").length < 3) {
    return { status: "error", code: "description_required", message: "Describe what is unsafe" };
  }
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await (db as unknown as HvemsClient).rpc("report_issue", {
      p_asset_id: assetId,
      p_summary: v.data.summary,
      p_description: v.data.description || null,
      p_urgency: v.data.urgency,
      p_evidence: v.data.evidence,
      p_client_request_id: v.data.requestId,
    });
    if (error) throw toAppError(error);
    const id = (data as { defect_id: string }).defect_id;
    revalidatePath(`/driver/o/${orgId}`);
    return { status: "success", data: { id } };
  } catch (e) {
    return errorState(e);
  }
}
