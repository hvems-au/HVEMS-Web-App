"use server";
import { revalidatePath } from "next/cache";
import { addDocument, supersedeDocument } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  assetId: z.string().uuid(),
  category: z.enum(["registration", "insurance", "service_record", "inspection_report", "warranty", "manual", "certificate", "photo", "other"]),
  title: z.string().trim().min(2, "Give the document a title").max(160),
  path: z.string().min(3).max(400),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(0).max(26214400, "Files can be up to 25 MB").optional(),
  expiresOn: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional()
    .transform((v) => v || null),
  notes: z.string().trim().max(2000).optional(),
  replaces: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  replaceReason: z.string().trim().max(1000).optional(),
});

/** Record a document the browser has just uploaded to this equipment's folder. */
export async function addDocumentAction(orgId: string, input: unknown): Promise<ActionState> {
  const v = schema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the document" };
  try {
    const db = await createSupabaseServerClient();
    await addDocument(db, v.data);
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success", message: v.data.replaces ? "Document replaced" : "Document added" };
  } catch (e) {
    return errorState(e);
  }
}

export async function supersedeDocumentAction(orgId: string, id: string, reason: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await supersedeDocument(db, z.string().uuid().parse(id), reason);
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success", message: "Document retired (kept in the history)" };
  } catch (e) {
    return errorState(e);
  }
}
