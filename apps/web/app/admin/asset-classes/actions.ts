"use server";
import { revalidatePath } from "next/cache";
import { createAssetClass } from "@hvems/api-client";
import { assetClassSchema } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Add an HVEMS standard class, available to every company (spec AST-02). Super Admin only; enforced by the database. */
export async function createStandardClassAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = assetClassSchema.safeParse({
    name: form.get("name"),
    category: form.get("category"),
    default_meter_type: form.get("default_meter_type"),
  });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    const cls = await createAssetClass(db, null, parsed.data);
    revalidatePath("/admin/asset-classes");
    return { status: "success", message: `Standard class “${cls.name}” added for every company` };
  } catch (e) {
    return errorState(e);
  }
}
