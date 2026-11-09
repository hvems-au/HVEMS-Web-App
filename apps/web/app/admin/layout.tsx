import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { adminNav } from "@/lib/navigation";
import { getStaffContext, requireUser } from "@/lib/session";

/**
 * HVEMS administration console (SoW §2.3). Served only on ADMIN_HOST
 * (enforced in proxy.ts). Staff must always use MFA; the database also
 * refuses staff access without an aal2 session.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/admin");
  const staff = await getStaffContext();
  if (!staff) notFound();
  if (user.aal !== "aal2") redirect("/account/security?required=1&next=/admin");
  const label = staff.role === "platform_administrator" ? "Platform Administrator" : "Support Agent";
  const current = { id: "hvems", name: "HVEMS Console", kindLabel: "Administration", portal: "admin" as const, roleLabel: label, href: "/admin" };
  return (
    <AppShell nav={adminNav()} user={{ fullName: user.fullName, email: user.email }} current={current} contexts={[current]}>
      {children}
    </AppShell>
  );
}
