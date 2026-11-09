import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getSessionUser } from "@/lib/session";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  // The recovery link signs the person in (via /auth/callback) before landing here.
  if (!(await getSessionUser())) redirect("/login?error=link");
  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your HVEMS account.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
