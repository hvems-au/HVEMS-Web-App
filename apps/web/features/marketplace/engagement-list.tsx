import Link from "next/link";
import type { Engagement } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ENGAGEMENT_STATUS } from "./labels";

/**
 * Engagements for either portal, newest first. In the company portal a company can be the customer on
 * some and the provider on others (decision O-13), so each row can show its role and the other party.
 */
export function EngagementList({
  rows,
  base,
  tz,
  otherName,
  roleOf,
  linkable = true,
}: {
  rows: Engagement[];
  base: string;
  tz: string;
  /** Name of the other party, by engagement id. */
  otherName?: Map<string, string>;
  roleOf?: (e: Engagement) => "Customer" | "Provider";
  linkable?: boolean | ((e: Engagement) => boolean);
}) {
  const canOpen = (e: Engagement) => (typeof linkable === "function" ? linkable(e) : linkable);
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState title="No engagements yet">Engagements appear here once a proposal is accepted.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Job</TH>
              {roleOf ? <TH>We are</TH> : null}
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
                    {canOpen(e) ? (
                      <Link href={`${base}/engagements/${e.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                        {e.job?.title ?? "Job"}
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink">{e.job?.title ?? "Job"}</span>
                    )}
                    <span className="block text-[12.5px] text-ink-muted">
                      Engagement {e.number}
                      {e.job?.suburb ? ` · ${e.job.suburb}` : ""}
                      {e.job?.urgency === "urgent" ? " · Urgent" : ""}
                    </span>
                  </TD>
                  {roleOf ? (
                    <TD>
                      <Badge tone={roleOf(e) === "Provider" ? "blue" : "grey"}>{roleOf(e)}</Badge>
                    </TD>
                  ) : null}
                  {otherName ? <TD>{otherName.get(e.id) ?? "—"}</TD> : null}
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
