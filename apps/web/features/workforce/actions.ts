"use server";
import { revalidatePath } from "next/cache";
import { addLeave, cancelLeave, deleteQualification, previewAllocationWarnings, saveQualification, saveWorkforceProfile } from "@hvems/api-client";
import { LEAVE_KINDS, QUALIFICATION_KINDS, type AllocationWarning } from "@hvems/domain";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const optDate = z
  .union([z.literal(""), z.string().regex(ISO)])
  .optional()
  .transform((v) => (v ? v : null));

function refresh(orgId: string, userId?: string) {
  revalidatePath(`/customer/${orgId}/technicians`);
  if (userId) revalidatePath(`/customer/${orgId}/technicians/${userId}`);
}
const invalid = (e: z.ZodError): ActionState => ({ status: "error", code: "invalid", message: e.issues[0]?.message ?? "Check the details" });

const profileSchema = z.object({
  trade: opt(80),
  phone: opt(30),
  notes: opt(1000),
  available: z.boolean(),
});

export async function saveProfileAction(orgId: string, userId: string, input: unknown): Promise<ActionState> {
  const v = profileSchema.safeParse(input);
  if (!v.success) return invalid(v.error);
  try {
    await saveWorkforceProfile(await createSupabaseServerClient(), orgId, userId, v.data);
    refresh(orgId, userId);
    return { status: "success", message: "Profile saved" };
  } catch (e) {
    return errorState(e);
  }
}

const qualificationSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(QUALIFICATION_KINDS),
    label: opt(80),
    number: opt(60),
    issued_by: opt(80),
    expires_on: optDate,
  })
  .refine((v) => v.kind !== "other" || v.label, { path: ["label"], message: "Name the qualification" });

export async function saveQualificationAction(orgId: string, userId: string, input: unknown): Promise<ActionState> {
  const v = qualificationSchema.safeParse(input);
  if (!v.success) return invalid(v.error);
  try {
    await saveQualification(await createSupabaseServerClient(), { ...v.data, organisationId: orgId, userId });
    refresh(orgId, userId);
    return { status: "success", message: v.data.id ? "Qualification updated" : "Qualification added" };
  } catch (e) {
    const s = errorState(e);
    if (s.status === "error" && s.code === "23505") return { ...s, message: "This person already has that qualification. Edit it instead." };
    return s;
  }
}

export async function deleteQualificationAction(orgId: string, userId: string, id: string): Promise<ActionState> {
  try {
    await deleteQualification(await createSupabaseServerClient(), orgId, id);
    refresh(orgId, userId);
    return { status: "success", message: "Qualification removed" };
  } catch (e) {
    return errorState(e);
  }
}

const leaveSchema = z
  .object({
    kind: z.enum(LEAVE_KINDS),
    starts_on: z.string().regex(ISO, "Choose the first day"),
    ends_on: z.string().regex(ISO, "Choose the last day"),
    note: opt(500),
  })
  .refine((v) => v.ends_on >= v.starts_on, { path: ["ends_on"], message: "The last day can't be before the first" });

export async function addLeaveAction(orgId: string, userId: string, input: unknown): Promise<ActionState> {
  const v = leaveSchema.safeParse(input);
  if (!v.success) return invalid(v.error);
  try {
    await addLeave(await createSupabaseServerClient(), orgId, userId, v.data);
    refresh(orgId, userId);
    revalidatePath(`/customer/${orgId}/work-orders`);
    return { status: "success", message: "Leave added" };
  } catch (e) {
    return errorState(e);
  }
}

export async function cancelLeaveAction(orgId: string, userId: string, id: string): Promise<ActionState> {
  try {
    await cancelLeave(await createSupabaseServerClient(), id);
    refresh(orgId, userId);
    return { status: "success", message: "Leave cancelled" };
  } catch (e) {
    return errorState(e);
  }
}

/** Live warnings for the work order form (the database works them out). */
export async function allocationWarningsAction(orgId: string, userId: string, dueOn: string, required: string): Promise<AllocationWarning[]> {
  if (!userId) return [];
  try {
    return await previewAllocationWarnings(await createSupabaseServerClient(), orgId, userId, ISO.test(dueOn) ? dueOn : null, required || null);
  } catch {
    return [];
  }
}
