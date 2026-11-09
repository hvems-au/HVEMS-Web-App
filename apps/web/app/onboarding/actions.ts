"use server";
import { redirect } from "next/navigation";
import { createOrganisation } from "@hvems/api-client";
import { createOrganisationSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { getCurrentPortal, portalPathFor } from "@/lib/current-portal";
import { PORTAL_INFO } from "@/lib/portals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createOrganisationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = createOrganisationSchema.safeParse({ kind: form.get("kind"), name: form.get("name"), abn: form.get("abn") ?? "" });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  // Each portal creates only its own kind of account (ADR-009).
  if (!PORTAL_INFO[await getCurrentPortal()].orgKinds.includes(parsed.data.kind)) {
    return { status: "error", code: "wrong_portal", message: "This account type is created in a different portal." };
  }
  let orgId: string;
  try {
    const db = await createSupabaseServerClient();
    orgId = await createOrganisation(db, parsed.data);
  } catch (e) {
    return errorState(e);
  }
  redirect(portalPathFor({ kind: parsed.data.kind, organisation_id: orgId }));
}
