import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ENTITY_LABELS } from "./format";
import { ACTION_LABELS, AUDIT_ACTIONS, auditQueryString, SECURITY_LABELS, type AuditQuery } from "./query";

type Opt = { value: string; label: string };

/** Tabs (changes / sign-in and security), filters and CSV export for the audit viewers (AUD-02). */
export function AuditFilterBar({
  basePath,
  q,
  people,
  organisations,
  organisation,
}: {
  basePath: string;
  q: AuditQuery;
  people: Opt[];
  /** Console only: organisation filter. */
  organisations?: Opt[];
  organisation?: string;
}) {
  const tab = (t: AuditQuery["tab"], label: string) => (
    <Link
      href={`${basePath}${auditQueryString({ tab: t, ...(organisation ? { org: organisation } : {}) } as Partial<AuditQuery>)}`}
      className={cn(
        "rounded-[8px] px-3 py-1.5 text-[13.5px] font-semibold",
        q.tab === t ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  const exportQuery = auditQueryString({ ...q, ...(organisation ? { org: organisation } : {}) } as Partial<AuditQuery>);
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-stroke px-4 py-3">
        {tab("changes", "Changes")}
        {tab("security", "Sign-in & security")}
        <a href={`${basePath}/export${exportQuery}`} className="ml-auto">
          <Button variant="secondary" size="sm" type="button">
            <Download /> Export CSV
          </Button>
        </a>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 p-4">
        {q.tab === "security" ? <input type="hidden" name="tab" value="security" /> : null}
        {organisations ? (
          <label className="flex min-w-[200px] flex-col gap-1 text-[13px] font-medium text-ink">
            Organisation
            <Select name="org" defaultValue={organisation ?? ""}>
              <option value="">All organisations and platform</option>
              <option value="platform">Platform only</option>
              {organisations.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
          From
          <Input type="date" name="from" defaultValue={q.from} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
          To
          <Input type="date" name="to" defaultValue={q.to} />
        </label>
        {q.tab === "changes" ? (
          <>
            <label className="flex min-w-[170px] flex-col gap-1 text-[13px] font-medium text-ink">
              Record
              <Select name="type" defaultValue={q.type}>
                <option value="">All records</option>
                {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex min-w-[130px] flex-col gap-1 text-[13px] font-medium text-ink">
              Action
              <Select name="action" defaultValue={q.action}>
                <option value="">All actions</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </Select>
            </label>
            {people.length ? (
              <label className="flex min-w-[170px] flex-col gap-1 text-[13px] font-medium text-ink">
                Who
                <Select name="actor" defaultValue={q.actor}>
                  <option value="">Anyone</option>
                  {people.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
          </>
        ) : (
          <label className="flex min-w-[200px] flex-col gap-1 text-[13px] font-medium text-ink">
            Event
            <Select name="event" defaultValue={q.event}>
              <option value="">All events</option>
              {Object.entries(SECURITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        <Link href={`${basePath}${q.tab === "security" ? "?tab=security" : ""}`} className="pb-2 text-[13px] text-link hover:underline">
          Clear
        </Link>
      </form>
    </Card>
  );
}
