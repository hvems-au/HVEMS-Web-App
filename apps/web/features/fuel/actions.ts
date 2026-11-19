"use server";
import { revalidatePath } from "next/cache";
import { recordFuel, setCostRate } from "@hvems/api-client";
import { z } from "@hvems/validation";
import { errorState, type ActionState } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const optionalNumber = z
  .union([z.literal(""), z.coerce.number().min(0)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const fuelSchema = z.object({
  assetId: z.string().uuid("Choose the equipment"),
  filledAt: z.string().min(10, "Enter the date and time"),
  quantity: z.coerce.number().positive("Enter the quantity").max(100000),
  fuelType: z.enum(["diesel", "unleaded", "adblue", "lpg", "oil", "other"]),
  unit: z.enum(["L", "kg", "each"]),
  cost: optionalNumber,
  gstIncluded: z.boolean().default(true),
  supplier: z.string().trim().max(160).optional(),
  odometerKm: optionalNumber,
  engineHours: optionalNumber,
  lowerReason: z.string().trim().max(500).optional(),
  confirmJump: z.boolean().optional(),
  receiptPaths: z.array(z.string().max(400)).max(3).default([]),
  notes: z.string().trim().max(1000).optional(),
  clientRequestId: z.string().uuid(),
  amendsId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  amendReason: z.string().trim().max(500).optional(),
});

/** Record a fuel fill (or correct one, with a reason). The reading goes on the equipment. */
export async function recordFuelAction(orgId: string, input: unknown): Promise<ActionState> {
  const v = fuelSchema.safeParse(input);
  if (!v.success) return { status: "error", code: "invalid", message: v.error.issues[0]?.message ?? "Check the fuel record" };
  const d = v.data;
  try {
    const db = await createSupabaseServerClient();
    await recordFuel(db, {
      ...d,
      filledAt: new Date(d.filledAt).toISOString(),
      costCents: d.cost === null ? null : Math.round(d.cost * 100),
      supplier: d.supplier || null,
      lowerReason: d.lowerReason || null,
      notes: d.notes || null,
      amendReason: d.amendReason || null,
    });
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success", message: d.amendsId ? "Fuel record corrected" : "Fuel recorded" };
  } catch (e) {
    return errorState(e);
  }
}

/** A technician's hourly cost rate, used for labour on closed work orders (cost readers only). */
export async function setCostRateAction(orgId: string, userId: string, dollars: string): Promise<ActionState> {
  const v = z.coerce.number().min(0, "Enter an hourly rate").max(10000).safeParse(dollars);
  if (!v.success || dollars.trim() === "") return { status: "error", code: "invalid", message: "Enter an hourly rate in dollars" };
  try {
    const db = await createSupabaseServerClient();
    await setCostRate(db, orgId, z.string().uuid().parse(userId), Math.round(v.data * 100));
    revalidatePath(`/customer/${orgId}`, "layout");
    return { status: "success", message: "Cost rate saved" };
  } catch (e) {
    return errorState(e);
  }
}
