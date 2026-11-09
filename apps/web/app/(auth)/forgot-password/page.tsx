import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password" subtitle="Enter your email address and we'll send you a link to reset your password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
