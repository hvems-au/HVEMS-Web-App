import { redirect } from "next/navigation";

/** Alerts was renamed Notifications; old links and bookmarks still work. */
export default async function AlertsRedirect({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/customer/${orgId}/notifications`);
}
