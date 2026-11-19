import type { Metadata } from "next";
import Link from "next/link";
import { listMarketplaceCases, type MarketplaceCase } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Cases" };

const CATEGORY: Record<string, string> = { no_show: "No-show", conduct: "Conduct", safety: "Safety concern", fee: "Fee", strike_review: "Strike review", other: "Other" };
const TABS: { key: MarketplaceCase["status"] | "all"; label: string }[] = [
  { key: "under_review", label: "Ready to decide" },
  { key: "awaiting_response", label: "Waiting for a response" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
];

/** Marketplace cases: no-shows, conduct, safety, fees and strike reviews (MKT-18, MKT-24). */
export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === firstParam(sp.status))?.key ?? "under_review";
  const db = await createSupabaseServerClient();
  const all = await listMarketplaceCases(db);
  const rows = tab === "all" ? all : all.filter((c) => c.status === tab);
  return (
    <>
      <PageHeader title="Cases" description="HVEMS decides platform conduct, safety, fee and no-show cases. Work-quality and job-payment disputes are between the parties." />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stroke" aria-label="Case status">
        {TABS.map((t) => {
          const n = t.key === "all" ? all.length : all.filter((c) => c.status === t.key).length;
          return (
            <Link
              key={t.key}
              href={`/admin/cases?status=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium whitespace-nowrap", tab === t.key ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t.label}
              {n ? (
                <Badge tone={t.key === "under_review" ? "amber" : "grey"} className="ml-2">
                  {n}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No cases here" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Case</TH>
                <TH>Provider</TH>
                <TH>Raised by</TH>
                <TH>Respond by</TH>
                <TH>Raised</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD className="max-w-[320px]">
                    <Link href={`/admin/cases/${c.id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                      Case {c.number}: {CATEGORY[c.category]}
                    </Link>
                    <span className="block truncate text-[12.5px] text-ink-muted">{c.description}</span>
                  </TD>
                  <TD>{c.provider?.name ?? "—"}</TD>
                  <TD>{c.raised_by_side === "poster" ? "Customer" : c.raised_by_side === "provider" ? "Provider" : "HVEMS"}</TD>
                  <TD className="whitespace-nowrap">{c.respond_by && c.status === "awaiting_response" ? formatDateTimeAU(new Date(c.respond_by)) : "—"}</TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDateTimeAU(new Date(c.created_at))}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
