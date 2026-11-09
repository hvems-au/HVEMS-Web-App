"use server";
import { redirect } from "next/navigation";
import { createOrganisation } from "@hvems/api-client";
import { PORTAL_FOR_KIND } from "@hvems/permissions";
import { createOrganisationSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createOrganisationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = createOrganisationSchema.safeParse({ kind: form.get("kind"), name: form.get("name"), abn: form.get("abn") ?? "" });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  let orgId: string;
  try {
    const db = await createSupabaseServerClient();
    orgId = await createOrganisation(db, parsed.data);
  } catch (e) {
    return errorState(e);
  }
  redirect(`/${PORTAL_FOR_KIND[parsed.data.kind]}/${orgId}/dashboard`);
}
