import type { Metadata } from "next";
import { listSuppliers } from "@hvems/api-client";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { SupplierDialog } from "@/features/parts/lists";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Suppliers" };

/** Supplier list (PRT-07): chosen on parts requests and orders. */
export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "parts.manage");
  const db = await createSupabaseServerClient();
  const all = await listSuppliers(db, orgId, true);
  const q = (firstParam(sp.q) ?? "").trim().toLowerCase();
  const showArchived = firstParam(sp.show) === "archived";
  const rows = all.filter(
    (s) => (showArchived ? true : !s.archived_at) && (!q || [s.name, s.abn, s.contact_name, s.email, s.phone, s.account_number].some((x) => (x ?? "").toLowerCase().includes(q))),
  );
  const base = `/customer/${orgId}/parts/suppliers`;
  return (
    <>
      <PageHeader title="Suppliers" description="Who you buy parts from." breadcrumb={{ label: "Parts", href: `/customer/${orgId}/parts` }} actions={<SupplierDialog orgId={orgId} />} />
      <Card>
        <FilterBar
          action={base}
          search={{ value: q, placeholder: "Name, ABN, contact or account" }}
          fields={[{ kind: "select", name: "show", label: "Show", all: "Current only", value: showArchived ? "archived" : "", options: [{ value: "archived", label: "Including archived" }] }]}
        />
        {rows.length === 0 ? (
          <EmptyState title={all.length ? "No suppliers match" : "No suppliers yet"}>{all.length ? null : "Add the businesses you buy parts from."}</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Supplier</TH>
                <TH>Contact</TH>
                <TH>Account</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <span className="font-semibold">{s.name}</span>
                    {s.archived_at ? (
                      <Badge tone="grey" className="ml-2">
                        Archived
                      </Badge>
                    ) : null}
                    {s.abn ? <span className="block text-[12.5px] text-ink-muted">ABN {s.abn}</span> : null}
                  </TD>
                  <TD className="text-[13.5px]">
                    {s.contact_name ?? "—"}
                    <span className="block text-ink-muted">{[s.email, s.phone].filter(Boolean).join(" · ")}</span>
                  </TD>
                  <TD>{s.account_number ?? "—"}</TD>
                  <TD className="text-right">
                    <SupplierDialog
                      orgId={orgId}
                      supplier={{
                        id: s.id,
                        name: s.name,
                        abn: s.abn ?? "",
                        contact_name: s.contact_name ?? "",
                        email: s.email ?? "",
                        phone: s.phone ?? "",
                        account_number: s.account_number ?? "",
                        notes: s.notes ?? "",
                        archived: !!s.archived_at,
                      }}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
