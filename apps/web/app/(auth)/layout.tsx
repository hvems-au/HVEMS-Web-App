import { AuthFrame } from "@/components/auth-card";

/** Sign-in, sign-up, password recovery and email-link pages share one focused frame. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
