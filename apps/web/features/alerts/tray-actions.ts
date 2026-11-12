"use server";
import { revalidatePath } from "next/cache";
import { listMyNotifications, markNotificationsRead } from "@hvems/api-client";
import type { AppNotification } from "@hvems/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The latest alerts for the bell tray (RLS: only the signed-in person's own). */
export async function loadTrayAction(orgId: string): Promise<{ items: AppNotification[]; error?: string }> {
  try {
    const db = await createSupabaseServerClient();
    return { items: await listMyNotifications(db, orgId, 12) };
  } catch {
    return { items: [], error: "Couldn't load alerts. Try again." };
  }
}

/** Mark some (or all) of the person's alerts as read. */
export async function markTrayReadAction(orgId: string, ids?: string[]): Promise<{ ok: boolean }> {
  try {
    const db = await createSupabaseServerClient();
    await markNotificationsRead(db, ids);
    revalidatePath(`/customer/${orgId}`, "layout");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
