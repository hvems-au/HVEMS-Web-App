"use server";
import { revalidatePath } from "next/cache";
import { adminSetOrganisationSuspended, adminUpdateOrganisation } from "@hvems/api-client";
import { adminOrganisationSchema, organisationSuspensionSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
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
