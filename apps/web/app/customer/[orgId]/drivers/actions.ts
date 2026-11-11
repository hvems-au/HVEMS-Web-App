"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createDriverProfile,
  deleteDriverCredential,
  formatDriverId,
  resetDriverSetup,
  saveDriverCredential,
  setDriverActive,
  setOperatorEquipment,
  type HvemsClient,
} from "@hvems/api-client";
import { CREDENTIAL_KINDS } from "@hvems/domain";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SetupResult = { driverId: string; setupCode: string; expiresAt: string };

/**
 * The login account behind a driver profile: created with the service role
 * (the address is internal and never used for email), then linked by the
 * database, which gives it the driver role in that company only.
 */
async function ensureDriverAccount(driverId: string, fullName: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `driver-${driverId}@drivers.hvems.invalid`,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: fullName, kind: "driver_profile" },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the driver's login");
  const { error: linkError } = await (admin as unknown as HvemsClient).rpc("link_driver_account", { p_driver_id: driverId, p_user_id: data.user.id });
  if (linkError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(linkError.message);
  }
}

export async function createDriverAction(orgId: string, input: { fullName: string; phone?: string }): Promise<ActionState<SetupResult>> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Enter the driver's name").max(120),
      phone: z.union([z.literal(""), z.string().trim().max(40).regex(/^[0-9 +()-]+$/, "Use digits, spaces, +, ( ) or -")]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid", message: parsed.error.issues[0]?.message ?? "Check the details" };
  try {
    const db = await createSupabaseServerClient();
    const created = await createDriverProfile(db, { organisationId: orgId, fullName: parsed.data.fullName, phone: parsed.data.phone });
    await ensureDriverAccount(created.id, parsed.data.fullName);
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", data: { driverId: formatDriverId(created.driver_number), setupCode: created.setup_code, expiresAt: created.setup_expires_at } };
  } catch (e) {
    return errorState(e);
  }
}

/** Finish a profile whose login account could not be created the first time. */
export async function finishDriverAccountAction(orgId: string, driverId: string, fullName: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    // Only someone who can manage this profile may finish it (RLS hides others).
    const { data } = await db.from("driver_profiles").select("id, user_id").eq("id", driverId).eq("organisation_id", orgId).maybeSingle();
    if (!data) return { status: "error", code: "not_found", message: "Driver not found" };
    if (!data.user_id) await ensureDriverAccount(driverId, fullName);
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", message: "Login set up" };
  } catch (e) {
    return errorState(e);
  }
}

export async function resetDriverPinAction(orgId: string, driverId: string): Promise<ActionState<SetupResult>> {
  try {
    const db = await createSupabaseServerClient();
    const res = await resetDriverSetup(db, z.string().uuid().parse(driverId));
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", data: { driverId: formatDriverId(res.driver_number), setupCode: res.setup_code, expiresAt: res.setup_expires_at } };
  } catch (e) {
    return errorState(e);
  }
}

export async function setDriverActiveAction(orgId: string, driverId: string, active: boolean): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await setDriverActive(db, z.string().uuid().parse(driverId), active);
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", message: active ? "Driver re-activated" : "Driver deactivated" };
  } catch (e) {
    return errorState(e);
  }
}

export async function setDriverEquipmentAction(orgId: string, membershipId: string, assetIds: string[]): Promise<ActionState> {
  try {
    const ids = z.array(z.string().uuid()).max(2000).parse(assetIds);
    const db = await createSupabaseServerClient();
    await setOperatorEquipment(db, orgId, z.string().uuid().parse(membershipId), ids);
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", message: "Equipment access saved" };
  } catch (e) {
    return errorState(e);
  }
}

// ------------------------------------------------------------- credentials (2B)
const credentialSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(CREDENTIAL_KINDS),
    label: z.string().trim().max(80).optional(),
    number: z.string().trim().min(1, "Enter the number").max(60),
    issued_by: z.string().trim().max(80).optional(),
    expires_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
      .optional()
      .or(z.literal("")),
  })
  .refine((v) => v.kind !== "other" || (v.label ?? "").length > 0, { path: ["label"], message: "Name the card or ticket" });

export async function saveDriverCredentialAction(orgId: string, driverId: string, input: unknown): Promise<ActionState> {
  const v = credentialSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the details" };
  try {
    const db = await createSupabaseServerClient();
    await saveDriverCredential(db, {
      organisationId: orgId,
      driverId,
      id: v.data.id,
      kind: v.data.kind,
      label: v.data.label || null,
      number: v.data.number,
      issued_by: v.data.issued_by || null,
      expires_on: v.data.expires_on || null,
    });
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", message: "Credential saved" };
  } catch (e) {
    const s = errorState(e);
    if (s.status === "error" && s.code === "23505") return { ...s, message: "This driver already has that credential. Edit it instead." };
    return s;
  }
}

export async function deleteDriverCredentialAction(orgId: string, credentialId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await deleteDriverCredential(db, orgId, credentialId);
    revalidatePath(`/customer/${orgId}/drivers`);
    return { status: "success", message: "Credential removed" };
  } catch (e) {
    return errorState(e);
  }
}
