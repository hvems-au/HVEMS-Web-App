import Link from "next/link";
import type { Engagement } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ENGAGEMENT_STATUS } from "./labels";

/** Engagements for either portal, newest first. */
export function EngagementList({ rows, base, tz, otherName }: { rows: Engagement[]; base: string; tz: string; otherName?: Map<string, string> }) {
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState title="No engagements yet">Engagements appear here once a proposal is accepted.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Job</TH>
              {otherName ? <TH>With</TH> : null}
              <TH>Status</TH>
              <TH>Accepted</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((e) => {
              const st = ENGAGEMENT_STATUS[e.status] ?? { label: e.status, tone: "grey" as const };
              return (
                <TR key={e.id}>
                  <TD className="max-w-[320px]">
                    <Link href={`${base}/engagements/${e.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                      {e.job?.title ?? "Job"}
                    </Link>
                    <span className="block text-[12.5px] text-ink-muted">
                      Engagement {e.number}
                      {e.job?.suburb ? ` · ${e.job.suburb}` : ""}
                      {e.job?.urgency === "urgent" ? " · Urgent" : ""}
                    </span>
                  </TD>
                  {otherName ? <TD>{otherName.get(e.provider_id) ?? "—"}</TD> : null}
                  <TD>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(e.accepted_at), tz)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
