import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";
import { EmailPreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Email preferences" };

export default async function NotificationPreferencesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/account/notifications");
  const sp = await searchParams;
  const next = firstParam(sp.next);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/select-context";
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from("notification_preferences" as never)
    .select("email_maintenance, email_marketplace")
    .eq("user_id" as never, user.id as never)
    .maybeSingle();
  const row = data as { email_maintenance: boolean; email_marketplace: boolean } | null;
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mx-auto mb-8 w-44">
          <Logo variant="horizontal" priority />
        </div>
        <div className="card px-6 py-7">
          <h1 className="text-h1 text-ink">Email preferences</h1>
          <p className="mt-1 mb-6 text-[14px] text-ink-subtle">Emails go to {user.email}</p>
          <EmailPreferencesForm initial={{ maintenance: row?.email_maintenance ?? true, marketplace: row?.email_marketplace ?? true }} />
        </div>
        <p className="mt-4 text-center">
          <Link href={safeNext} className="text-[14px] text-link hover:underline">
            Back
          </Link>
        </p>
      </div>
    </div>
  );
}
