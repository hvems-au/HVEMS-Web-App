"use server";
import { redirect } from "next/navigation";
import { parseDriverId, toAppError, type HvemsClient } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { lockedMessage, passwordSignIn, wrongPasswordMessage } from "@/lib/sign-in-lockout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const codeSchema = z.string().trim().min(6).max(40);

/**
 * Driver sign-in on the driver portal (O-10). The database checks the Driver
 * ID and PIN (or setup code + new PIN) for the company that owns the scanned
 * equipment and counts wrong attempts; on success the server opens a session
 * for the driver's linked account on this portal only.
 */
export async function driverSignInAction(input: { code: string; driverId: string; secret: string; newPin?: string }): Promise<ActionState> {
  const number = parseDriverId(input.driverId);
  if (!number) return { status: "error", code: "invalid", message: "Enter your Driver ID, e.g. D-0001" };
  const v = z
    .object({ code: codeSchema, secret: z.string().trim().min(4, "Enter your PIN").max(20), newPin: z.string().regex(/^\d{6}$/, "Your new PIN must be 6 digits").optional() })
    .safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the details" };
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await (admin as unknown as HvemsClient).rpc("driver_sign_in", {
      p_code: v.data.code,
      p_driver_number: number,
      p_secret: v.data.secret,
      p_new_pin: v.data.newPin ?? null,
    });
    if (error) throw toAppError(error);
    const res = data as { ok: boolean; code?: string; message?: string; user_id?: string };
    if (!res.ok || !res.user_id) return { status: "error", code: res.code ?? "invalid_credentials", message: res.message ?? "Driver ID or PIN is not right" };

    const { data: user } = await admin.auth.admin.getUserById(res.user_id);
    if (!user.user?.email) throw new Error("Driver login is not set up");
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.user.email });
    if (linkError || !link.properties?.hashed_token) throw new Error("Could not sign in");
    const db = await createSupabaseServerClient();
    await db.auth.signOut({ scope: "local" });
    const { error: otpError } = await db.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
    if (otpError) throw new Error("Could not sign in");
    return { status: "success" };
  } catch (e) {
    return errorState(e);
  }
}

/** Members with their own login (technicians, fleet managers) can sign in here too. */
export async function memberSignInAction(input: { email: string; password: string }): Promise<ActionState> {
  const v = z.object({ email: z.string().trim().email("Enter your email"), password: z.string().min(1, "Enter your password") }).safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the details" };
  const db = await createSupabaseServerClient();
  const res = await passwordSignIn(db, v.data.email, v.data.password, "driver");
  if (!res.ok) {
    return res.locked
      ? { status: "error", code: "account_locked", message: lockedMessage(res.lockedUntil) }
      : { status: "error", code: "invalid_credentials", message: wrongPasswordMessage("Email or password is not right.", res) };
  }
  return { status: "success" };
}

export async function driverSignOutAction(code?: string): Promise<void> {
  const db = await createSupabaseServerClient();
  await db.auth.signOut({ scope: "local" });
  redirect(code ? `/driver/e/${encodeURIComponent(code)}` : "/driver");
}

export async function openCodeAction(_prev: unknown, form: FormData): Promise<{ error?: string }> {
  const raw = String(form.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 10) return { error: "Enter the 10-character code printed under the QR label" };
  redirect(`/driver/e/${raw}`);
}
