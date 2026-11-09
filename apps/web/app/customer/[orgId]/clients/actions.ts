"use server";
import { revalidatePath } from "next/cache";
import { createClientRecord, createSite, updateClientRecord, updateSite } from "@hvems/api-client";
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

/** Only the fields the form sent, so fields not on the form (e.g. client notes) are left alone. */
function sentFields<T extends Record<string, unknown>>(values: T, form: FormData): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([k]) => form.has(k))) as Partial<T>;
}

export async function updateClientAction(orgId: string, clientId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = clientFormSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await updateClientRecord(db, clientId, sentFields(parsed.data, form));
    revalidatePath(`/customer/${orgId}/clients`);
    return { status: "success", message: "Client updated" };
  } catch (e) {
    return errorState(e);
  }
}

export async function updateSiteAction(orgId: string, siteId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = siteFormSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    await updateSite(db, siteId, sentFields(parsed.data, form));
    revalidatePath(`/customer/${orgId}/clients`);
    return { status: "success", message: "Site updated" };
  } catch (e) {
    return errorState(e);
  }
}
