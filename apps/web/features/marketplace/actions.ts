"use server";
import { revalidatePath } from "next/cache";
import { marketplaceRpc, type MarketplaceRpc } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result<T = unknown> = ActionState & { data?: T };

/** Thin wrapper: the database checks permissions and every rule; we revalidate the portal. */
async function call<T>(fn: MarketplaceRpc, args: Record<string, unknown>, message: string, revalidate: string): Promise<Result<T>> {
  try {
    const db = await createSupabaseServerClient();
    const data = await marketplaceRpc<T>(db, fn, args);
    revalidatePath(revalidate, "layout");
    return { status: "success", message, data } as Result<T>;
  } catch (e) {
    return errorState(e);
  }
}

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const cents = z
  .union([z.literal(""), z.coerce.number().min(0).max(100000000)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : Math.round(v * 100)));

// ---- Provider profile and verification ----------------------------------------------------------
const profileSchema = z.object({
  description: text(2000).optional(),
  contact_name: text(120).optional(),
  contact_phone: text(40).optional(),
  contact_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).optional(),
  categories: z.array(z.string()).max(10),
  region_codes: z.array(z.string()).max(40),
  base_suburb: text(80).optional(),
  base_postcode: z.union([z.literal(""), z.string().regex(/^\d{4}$/, "Postcode is 4 digits")]).optional(),
  radius_km: z.union([z.literal(""), z.coerce.number().int().min(1).max(1000)]).optional(),
  mobile_service: z.boolean(),
  workshop_address: text(300).optional(),
  hours: text(500).optional(),
  accepting_urgent: z.boolean(),
  unavailable_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
});

export async function saveProviderProfileAction(orgId: string, input: unknown) {
  const v = profileSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the profile" } as ActionState;
  return call("save_provider_profile", { p_organisation_id: orgId, p: v.data }, "Profile saved", `/provider/${orgId}`);
}

export async function addProviderDocumentAction(
  orgId: string,
  input: { kind: string; category?: string; title: string; path: string; fileName: string; contentType?: string; sizeBytes?: number; expiresOn?: string },
) {
  return call(
    "add_provider_document",
    {
      p_organisation_id: orgId,
      p_kind: input.kind,
      p_category: input.category || null,
      p_title: input.title,
      p_path: input.path,
      p_file_name: input.fileName,
      p_content_type: input.contentType ?? null,
      p_size_bytes: input.sizeBytes ?? null,
      p_expires_on: input.expiresOn || null,
    },
    "Document added",
    `/provider/${orgId}`,
  );
}

export async function retireProviderDocumentAction(orgId: string, id: string) {
  return call("retire_provider_document", { p_document_id: uuid.parse(id) }, "Document removed from your profile", `/provider/${orgId}`);
}

export async function submitVerificationAction(orgId: string) {
  return call("submit_provider_verification", { p_organisation_id: orgId }, "Sent for verification", `/provider/${orgId}`);
}

export async function decideVerificationAction(input: {
  orgId: string;
  approve: boolean;
  reason?: string;
  abnActive: boolean;
  abnNameMatches: boolean;
  insuranceDocumentId?: string;
  insuranceCoverDollars?: string;
  qualificationDocumentIds: string[];
}) {
  const cover = input.insuranceCoverDollars?.replace(/[^\d.]/g, "");
  return call(
    "decide_provider_verification",
    {
      p_organisation_id: uuid.parse(input.orgId),
      p_approve: input.approve,
      p_reason: input.reason || null,
      p_abn_active: input.abnActive,
      p_abn_name_matches: input.abnNameMatches,
      p_insurance_document_id: input.insuranceDocumentId || null,
      p_insurance_cover_cents: cover ? Math.round(Number(cover) * 100) : null,
      p_qualification_document_ids: input.qualificationDocumentIds,
    },
    input.approve ? "Provider verified" : "Verification rejected",
    "/admin",
  );
}

export async function setProviderSuspendedAction(orgId: string, suspended: boolean, reason: string) {
  return call("set_provider_suspended", { p_organisation_id: uuid.parse(orgId), p_suspended: suspended, p_reason: reason }, suspended ? "Provider suspended" : "Provider reinstated", "/admin");
}

export async function setRegionAction(code: string, name: string, open: boolean) {
  return call("set_marketplace_region", { p_code: code, p_name: name, p_open: open }, open ? "Region opened" : "Region closed", "/admin");
}

export async function registerInterestAction(orgId: string, suburb: string, postcode: string, note: string) {
  return call("register_region_interest", { p_organisation_id: orgId, p_suburb: suburb, p_postcode: postcode || null, p_note: note || null }, "Thanks, we've noted your interest", `/customer/${orgId}`);
}

// ---- Jobs ----------------------------------------------------------------------------------------
const jobSchema = z.object({
  title: text(160).min(3, "Give the job a title"),
  description: text(4000).min(10, "Describe the job (at least 10 characters)"),
  category: z.string().min(1, "Choose a category"),
  job_type: z.string().min(1, "Choose the job type"),
  urgency: z.enum(["standard", "urgent"]),
  region_code: z.string().min(1, "Choose the region"),
  suburb: text(80).min(2, "Enter the suburb"),
  postcode: z.union([z.literal(""), z.string().regex(/^\d{4}$/, "Postcode is 4 digits")]).optional(),
  address: text(300).optional(),
  site_access_notes: text(2000).optional(),
  preferred_from: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  preferred_to: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  preferred_time: text(120).optional(),
  budget_min: cents,
  budget_max: cents,
  required_badges: z.array(z.enum(["abn", "public_liability", "qualification"])).default([]),
  show_poster_name: z.boolean().default(false),
  invited_only: z.boolean().default(false),
  asset_id: z.string().optional(),
  work_order_id: z.string().optional(),
  share: z.array(z.string()).default([]),
  asset_description: z.object({ class: text(80), make: text(80), model: text(80), registration: text(20), description: text(500) }).partial().optional(),
  files: z.array(z.object({ path: z.string().max(400), file_name: z.string().max(200), content_type: z.string().max(120).optional(), shared: z.boolean() })).max(10).default([]),
  invite: z.array(z.string().uuid()).max(20).default([]),
});

export async function postJobAction(orgId: string, input: unknown) {
  const v = jobSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the job" } as Result<string>;
  const { budget_min, budget_max, ...rest } = v.data;
  return call<string>("post_marketplace_job", { p_organisation_id: orgId, p: { ...rest, budget_min_cents: budget_min, budget_max_cents: budget_max } }, "Job posted", `/customer/${orgId}`);
}

export async function extendJobAction(orgId: string, jobId: string) {
  return call("extend_marketplace_job", { p_job_id: uuid.parse(jobId) }, "Job extended by 14 days", `/customer/${orgId}`);
}

export async function withdrawJobAction(orgId: string, jobId: string, reason: string) {
  return call("withdraw_marketplace_job", { p_job_id: uuid.parse(jobId), p_reason: reason }, "Job withdrawn", `/customer/${orgId}`);
}

export async function inviteProvidersAction(orgId: string, jobId: string, providerIds: string[]) {
  return call<number>("invite_providers", { p_job_id: uuid.parse(jobId), p_provider_ids: z.array(uuid).parse(providerIds) }, "Invitations sent", `/customer/${orgId}`);
}

export async function clarificationAction(orgId: string, jobId: string, body: string) {
  return call<number>("send_marketplace_clarification", { p_job_id: uuid.parse(jobId), p_body: body }, "Clarification sent", `/customer/${orgId}`);
}

// ---- Provider side ------------------------------------------------------------------------------
export async function saveJobAction(providerId: string, jobId: string, saved: boolean) {
  return call("save_marketplace_job", { p_provider_id: providerId, p_job_id: uuid.parse(jobId), p_saved: saved }, saved ? "Saved" : "Removed from saved", `/provider/${providerId}`);
}

/** Either side of a thread; `portalPath` is what to refresh. */
export async function sendMessageAction(jobId: string, providerId: string, body: string, portalPath: string) {
  return call("send_marketplace_message", { p_job_id: uuid.parse(jobId), p_provider_id: uuid.parse(providerId), p_body: body }, "Message sent", portalPath);
}

const proposalSchema = z.object({
  price_basis: z.enum(["fixed", "estimate", "hourly"]),
  amount: cents,
  amount_max: cents,
  hourly_rate: cents,
  callout: cents,
  gst_applies: z.boolean({ message: "Say whether GST applies" }),
  gst_inclusive: z.boolean().default(false),
  available_from: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  available_to: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  arrival_minutes: z.union([z.literal(""), z.coerce.number().int().min(5).max(1440)]).optional(),
  valid_minutes: z.coerce.number().int().min(15).max(20160),
  inclusions: text(2000).optional(),
  exclusions: text(2000).optional(),
  assumptions: text(2000).optional(),
  note: text(2000).optional(),
  fee_consent: z.boolean(),
});

export async function submitProposalAction(providerId: string, jobId: string, input: unknown) {
  const v = proposalSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the proposal" } as ActionState;
  const { amount, amount_max, hourly_rate, callout, ...rest } = v.data;
  return call(
    "submit_marketplace_proposal",
    {
      p_provider_id: providerId,
      p_job_id: uuid.parse(jobId),
      p: { ...rest, amount_cents: amount, amount_max_cents: amount_max, hourly_rate_cents: hourly_rate, callout_cents: callout },
    },
    "Proposal submitted",
    `/provider/${providerId}`,
  );
}

export async function withdrawProposalAction(providerId: string, proposalId: string) {
  return call("withdraw_marketplace_proposal", { p_proposal_id: uuid.parse(proposalId) }, "Proposal withdrawn", `/provider/${providerId}`);
}

/** Verified providers to invite (MKT-21). Read-only. */
export async function searchProvidersAction(orgId: string, q: string, category: string, region: string) {
  try {
    const { searchMarketplaceProviders } = await import("@hvems/api-client");
    const db = await createSupabaseServerClient();
    return { status: "success" as const, data: await searchMarketplaceProviders(db, orgId, { q, category, region }) };
  } catch (e) {
    return errorState(e);
  }
}

// ---- Conversion to a company (CS-09) --------------------------------------------------------------
export async function convertToCompanyAction(orgId: string) {
  return call("convert_to_company" as MarketplaceRpc, { p_organisation_id: orgId }, "Your account is now a company", `/customer/${orgId}`);
}

export async function convertJobAssetAction(orgId: string, jobId: string, input: { assetNumber: string; classId: string; make: string; model: string; registration: string; state: string }) {
  return call<string>(
    "convert_job_asset" as MarketplaceRpc,
    {
      p_job_id: jobId,
      p_asset_number: input.assetNumber,
      p_asset_class_id: input.classId,
      p_make: input.make || null,
      p_model: input.model || null,
      p_registration: input.registration || null,
      p_registration_state: input.state || null,
    },
    "Equipment added to your register",
    `/customer/${orgId}`,
  );
}
