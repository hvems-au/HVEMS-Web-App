import type { Metadata } from "next";
import Link from "next/link";
import { OctagonAlert, TriangleAlert, UserX } from "lucide-react";
import { listMyNotifications } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Card, EmptyState } from "@/components/ui/primitives";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Alerts" };

const KIND = {
  critical_defect: { icon: OctagonAlert, tone: "text-danger" },
  minor_defect: { icon: TriangleAlert, tone: "text-[#c26a00]" },
  operator_not_fit: { icon: UserX, tone: "text-danger" },
} as const;

/** The signed-in person's alerts for this company (Owner and Fleet Managers receive defect alerts, O-07). */
export default async function AlertsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const rows = await listMyNotifications(db, orgId, 100);
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Critical and Minor faults from pre-starts. Acknowledgement and escalation (30 minutes, 2 hours) are being built next."
        actions={unread ? <MarkAllRead orgId={orgId} /> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No alerts">You&apos;ll see faults reported at pre-start here.</EmptyState>
        ) : (
          <ul className="divide-y divide-stroke">
            {rows.map((n) => {
              const k = KIND[n.kind];
              return (
                <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3.5", !n.read_at && "bg-[#fff7f0]")}>
                  <k.icon className={cn("mt-0.5 size-5 shrink-0", k.tone)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[14.5px] text-ink", !n.read_at && "font-semibold")}>{n.title}</p>
                    {n.body ? <p className="text-[13.5px] text-ink-muted">{n.body}</p> : null}
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-ink-subtle">
                      {formatDateTimeAU(new Date(n.created_at), ctx.timezone)}
                      {n.inspection_id ? (
                        <Link href={`/customer/${orgId}/inspections/${n.inspection_id}`} className="font-semibold text-link hover:underline">
                          View pre-start
                        </Link>
                      ) : null}
                      {n.asset_id ? (
                        <Link href={`/customer/${orgId}/equipment/${n.asset_id}`} className="font-semibold text-link hover:underline">
                          Open equipment
                        </Link>
                      ) : null}
                    </p>
                  </div>
                  {!n.read_at ? <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
