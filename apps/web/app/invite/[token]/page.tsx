import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acceptInvitation, AppError } from "@hvems/api-client";
import { AuthCard } from "@/components/auth-card";
import { FormAlert } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accept invitation" };

const MESSAGES: Record<string, string> = {
  invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  invitation_expired: "This invitation has expired. Ask the person who invited you to send a new one.",
  invitation_used: "This invitation has already been used.",
  invitation_invalid: "This invitation is not valid.",
  member_limit_reached: "This company has reached its member-login limit for companies with five or fewer assets.",
};

async function accept(token: string) {
  "use server";
  const db = await createSupabaseServerClient();
  let target = "/select-context";
  try {
    await acceptInvitation(db, token);
  } catch (e) {
    const code = e instanceof AppError ? e.code : "unknown";
    target = `/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(code)}`;
  }
  redirect(target);
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const error = (await searchParams).error;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <AuthCard title="Join on HVEMS" subtitle={`You're signed in as ${user.email}.`}>
        {typeof error === "string" ? (
          <div className="mb-5">
            <FormAlert>{MESSAGES[error] ?? "We couldn't accept this invitation."}</FormAlert>
          </div>
        ) : null}
        <form action={accept.bind(null, token)}>
          <Button type="submit" size="lg" className="w-full">
            Accept invitation
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}
