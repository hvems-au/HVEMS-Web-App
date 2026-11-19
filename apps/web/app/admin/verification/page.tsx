import type { Metadata } from "next";
import Link from "next/link";
import { listProviderProfiles, type ProviderProfile } from "@hvems/api-client";
import { formatAbn, formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, STRETCHED_LINK, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PROVIDER_CATEGORIES, VERIFICATION_STATUS, type ProviderCategory } from "@/features/marketplace/labels";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Provider verification" };

const TABS: { key: ProviderProfile["status"] | "all"; label: string }[] = [
  { key: "submitted", label: "Waiting for review" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Not approved" },
  { key: "suspended", label: "Suspended" },
  { key: "all", label: "All" },
];

/** The Verification Officer's queue (MKT-02, ADM). */
export default async function VerificationQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === firstParam(sp.status))?.key ?? "submitted") as (typeof TABS)[number]["key"];
  const staff = await getStaffContext();
  const db = await createSupabaseServerClient();
  const all = await listProviderProfiles(db);
  const rows = tab === "all" ? all : all.filter((p) => p.status === tab);
  const isOfficer = staff?.role === "platform_administrator" || staff?.authorities.includes("verification_officer");

  return (
    <>
      <PageHeader
        title="Provider verification"
        description={
          isOfficer
            ? "Check the ABN by hand (active and matching the business name), the insurance certificate and any qualifications, then approve or reject with a reason."
            : "Only Verification Officers decide. You can view the queue."
        }
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stroke" aria-label="Verification status">
        {TABS.map((t) => {
          const n = t.key === "all" ? all.length : all.filter((p) => p.status === t.key).length;
          return (
            <Link
              key={t.key}
              href={`/admin/verification?status=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-3 pb-2.5 text-[14px] font-medium whitespace-nowrap", tab === t.key ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t.label}
              {n ? (
                <Badge tone={t.key === "submitted" ? "amber" : "grey"} className="ml-2">
                  {n}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={tab === "submitted" ? "Nothing waiting for review" : "None"} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Provider</TH>
                <TH>ABN</TH>
                <TH>Services</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((p) => (
                <TR key={p.organisation_id}>
                  <TD>
                    <Link href={`/admin/verification/${p.organisation_id}`} className={cn("font-semibold text-ink hover:text-link", STRETCHED_LINK)}>
                      {p.organisation?.name}
                    </Link>
                    {p.organisation?.legal_name ? <span className="block text-[12.5px] text-ink-muted">{p.organisation.legal_name}</span> : null}
                  </TD>
                  <TD className="font-mono text-[13px]">{p.organisation?.abn ? formatAbn(p.organisation.abn) : "—"}</TD>
                  <TD className="max-w-[260px] text-[13px] text-ink-muted">{p.categories.map((c) => PROVIDER_CATEGORIES[c as ProviderCategory] ?? c).join(", ")}</TD>
                  <TD>
                    <Badge tone={VERIFICATION_STATUS[p.status].tone}>{VERIFICATION_STATUS[p.status].label}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-muted">{p.submitted_at ? formatDateTimeAU(new Date(p.submitted_at)) : "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
