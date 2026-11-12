import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { adminNav } from "@/lib/navigation";
import { getStaffContext, requireUser } from "@/lib/session";

/**
 * HVEMS administration console (SoW §2.3). Served only on ADMIN_HOST
 * (enforced in proxy.ts). Staff must use MFA: the database decides
 * (mfa_satisfied), and refuses staff access without it. The development
 * database can switch MFA off for testing (security.mfa_enforced).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/admin");
  const staff = await getStaffContext();
  if (!staff) notFound();
  if (!staff.mfa_satisfied) redirect("/account/security?required=1&next=/admin");
  const label = staff.role === "platform_administrator" ? "Super Admin" : "Support Agent";
  const current = { id: "hvems", name: "HVEMS Console", kindLabel: "Administration", portal: "admin" as const, roleLabel: label, href: "/admin" };
  return (
    <AppShell nav={adminNav()} user={{ fullName: user.fullName, email: user.email }} current={current} contexts={[current]}>
      {children}
    </AppShell>
  );
}
