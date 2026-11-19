import type { Metadata } from "next";
import Link from "next/link";
import { listDocuments } from "@hvems/api-client";
import { todayISO } from "@hvems/domain";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { DOCUMENT_CATEGORIES, type DocCategory } from "@/features/documents/categories";
import { toDocRows } from "@/features/documents/rows";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Documents" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Every equipment document in one place, with what's expired or expiring (CS-22). */
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  const db = await createSupabaseServerClient();
  const today = todayISO(ctx.timezone);
  const docs = await listDocuments(db, { organisationId: orgId });
  const rows = await toDocRows(db, docs, ctx.timezone, today);
  const assetOf = new Map(docs.map((d) => [d.id, d]));
  const f = {
    q: (firstParam(sp.q) ?? "").trim().toLowerCase(),
    expiry: firstParam(sp.expiry) ?? "",
    category: firstParam(sp.category) ?? "",
    asset: firstParam(sp.asset) ?? "",
  };
  const shown = rows.filter((r) => {
    const d = assetOf.get(r.id)!;
    return (
      (!f.q || [r.title, r.fileName, d.asset?.asset_number, d.asset?.make, d.asset?.model].some((x) => (x ?? "").toLowerCase().includes(f.q))) &&
      (!f.category || r.category === f.category) &&
      (!f.asset || d.asset_id === f.asset) &&
      (!f.expiry || (f.expiry === "none" ? !r.expiresOn : r.expiry === f.expiry))
    );
  });
  const counts = { expired: rows.filter((r) => r.expiry === "expired").length, soon: rows.filter((r) => r.expiry === "soon").length };
  const equipment = [...new Map(docs.map((d) => [d.asset_id, d.asset?.asset_number ?? "—"])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const base = `/customer/${orgId}/documents`;

  return (
    <>
      <PageHeader title="Documents" description="All equipment documents. Add or replace them on each equipment's page; reminders go out 30 and 7 days before expiry." />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: `Expired (${counts.expired})`, value: "expired", tone: "border-danger/40 text-danger-ink" },
          { label: `Expiring within 30 days (${counts.soon})`, value: "soon", tone: "border-warn-line text-warn-ink" },
        ].map((c) => (
          <Link
            key={c.value}
            href={f.expiry === c.value ? base : `${base}?expiry=${c.value}`}
            className={cn("rounded-full border bg-surface px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-surface-hover", c.tone, f.expiry === c.value && "ring-2 ring-brand/30")}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <Card>
        <FilterBar
          action={base}
          search={{ value: f.q, placeholder: "Title, file or equipment" }}
          fields={[
            {
              kind: "select",
              name: "expiry",
              label: "Expiry",
              all: "Any",
              value: f.expiry,
              options: [
                { value: "expired", label: "Expired" },
                { value: "soon", label: "Within 30 days" },
                { value: "ok", label: "Current" },
                { value: "none", label: "No expiry" },
              ],
            },
            {
              kind: "select",
              name: "category",
              label: "Type",
              all: "Any type",
              value: f.category,
              options: (Object.keys(DOCUMENT_CATEGORIES) as DocCategory[]).map((k) => ({ value: k, label: DOCUMENT_CATEGORIES[k] })),
            },
            { kind: "select", name: "asset", label: "Equipment", all: "All equipment", value: f.asset, options: equipment },
          ]}
        />
        {shown.length === 0 ? (
          <EmptyState title={rows.length ? "No documents match" : "No documents yet"}>
            {rows.length ? "Try a different search or filter." : "Open a piece of equipment and use Add document in its Documents section."}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Document</TH>
                <TH>Equipment</TH>
                <TH>Type</TH>
                <TH>Expiry</TH>
                <TH>Added</TH>
              </tr>
            </THead>
            <tbody>
              {shown.map((r) => {
                const d = assetOf.get(r.id)!;
                return (
                  <TR key={r.id}>
                    <TD className="max-w-[280px]">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="relative z-10 font-medium text-link hover:underline">
                          {r.title}
                        </a>
                      ) : (
                        <span className="font-medium">{r.title}</span>
                      )}
                      <span className="block truncate text-[12.5px] text-ink-muted">{r.fileName}</span>
                    </TD>
                    <TD>
                      <Link href={`/customer/${orgId}/equipment/${d.asset_id}#documents`} className="relative z-10 font-medium text-link hover:underline">
                        {d.asset?.asset_number}
                      </Link>
                    </TD>
                    <TD>{DOCUMENT_CATEGORIES[r.category]}</TD>
                    <TD>
                      {r.expiresOn ? (
                        <Badge tone={r.expiry === "expired" ? "red" : r.expiry === "soon" ? "amber" : "grey"}>{dmy(r.expiresOn)}</Badge>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </TD>
                    <TD className="text-[13px] text-ink-muted">
                      {r.uploadedAt}
                      <span className="block text-ink-subtle">{r.uploadedBy}</span>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
