"use server";
import { revalidatePath } from "next/cache";
import { createClientRecord, createSite } from "@hvems/api-client";
import { clientFormSchema, siteFormSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formObject(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

export async function createClientAction(orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = clientFormSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await createClientRecord(db, orgId, parsed.data);
    revalidatePath(`/customer/${orgId}/clients`);
    return { status: "success", message: "Client added" };
  } catch (e) {
    return errorState(e);
  }
}

export async function createSiteAction(orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = siteFormSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await createSite(db, orgId, parsed.data);
    revalidatePath(`/customer/${orgId}/clients`);
    return { status: "success", message: "Site added" };
  } catch (e) {
    return errorState(e);
  }
}
