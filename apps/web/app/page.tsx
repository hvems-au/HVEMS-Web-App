import { redirect } from "next/navigation";
import { getCurrentPortal } from "@/lib/current-portal";
import { PORTAL_INFO } from "@/lib/portals";
import { getSessionUser } from "@/lib/session";

export default async function Home() {
  const [user, portal] = await Promise.all([getSessionUser(), getCurrentPortal()]);
  redirect(user ? PORTAL_INFO[portal].home : "/login");
}
