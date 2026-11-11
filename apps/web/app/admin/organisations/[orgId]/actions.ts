"use server";
import { revalidatePath } from "next/cache";
import { adminResetUserMfa, adminSetOrganisationSuspended, adminUpdateOrganisation } from "@hvems/api-client";
import { adminOrganisationSchema, organisationSuspensionSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { removeAllMfaFactors } from "@/lib/mfa-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Super Admin organisation actions (ADM-02). Thin wrappers: the database
 * functions check that the caller is a Platform Administrator with MFA,
 * validate the values and write the audit events.
 */
export async function updateOrganisationAction(orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = adminOrganisationSchema.safeParse({
    name: form.get("name"),
    legal_name: form.get("legal_name") ?? "",
    abn: form.get("abn") ?? "",
    timezone: form.get("timezone"),
  });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await adminUpdateOrganisation(db, orgId, parsed.data);
    revalidatePath(`/admin/organisations/${orgId}`);
    revalidatePath("/admin/organisations");
    return { status: "success", message: "Organisation updated" };
  } catch (e) {
    return errorState(e);
  }
}

export async function setSuspendedAction(orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = organisationSuspensionSchema.safeParse({ suspend: form.get("suspend"), reason: form.get("reason") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await adminSetOrganisationSuspended(db, orgId, parsed.data.suspend, parsed.data.reason);
    revalidatePath(`/admin/organisations/${orgId}`);
    revalidatePath("/admin/organisations");
    return { status: "success", message: parsed.data.suspend ? "Organisation de-activated" : "Organisation reinstated" };
  } catch (e) {
    return errorState(e);
  }
}

/** Super Admin resets a person's MFA after confirming who they are (for example an Owner with no recovery codes). */
export async function adminResetUserMfaAction(orgId: string, userId: string, reason: string): Promise<ActionState> {
  const trimmed = reason.trim();
  if (trimmed.length < 10) return { status: "error", code: "reason_required", message: "Record how you confirmed the person's identity (at least 10 characters)." };
  try {
    const db = await createSupabaseServerClient();
    const id = await adminResetUserMfa(db, userId, trimmed.slice(0, 500));
    await removeAllMfaFactors(id);
    revalidatePath(`/admin/organisations/${orgId}`);
    return { status: "success", message: "MFA reset. They'll set up their authenticator app at their next sign-in." };
  } catch (e) {
    return errorState(e);
  }
}
