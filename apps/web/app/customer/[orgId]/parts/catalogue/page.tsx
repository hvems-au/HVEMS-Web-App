import type { Metadata } from "next";
import { listCatalogue, listSuppliers } from "@hvems/api-client";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { CatalogueDialog } from "@/features/parts/lists";
import { aud } from "@/features/parts/status";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Parts catalogue" };

/** Parts catalogue (PRT-06): picking a part on a request fills the line. */
export default async function CataloguePage({
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
  const [all, suppliers] = await Promise.all([listCatalogue(db, orgId, true), listSuppliers(db, orgId)]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const supplierOpts = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const q = (firstParam(sp.q) ?? "").trim().toLowerCase();
  const supplier = firstParam(sp.supplier) ?? "";
  const showArchived = firstParam(sp.show) === "archived";
  const rows = all.filter(
    (c) =>
      (showArchived ? true : !c.archived_at) &&
      (!supplier || c.supplier_id === supplier) &&
      (!q || [c.description, c.part_number].some((x) => (x ?? "").toLowerCase().includes(q))),
  );
  const base = `/customer/${orgId}/parts/catalogue`;
  return (
    <>
      <PageHeader
        title="Parts catalogue"
        description="Parts you order often. Picking one on a request fills in the line."
        breadcrumb={{ label: "Parts", href: `/customer/${orgId}/parts` }}
        actions={<CatalogueDialog orgId={orgId} suppliers={supplierOpts} />}
      />
      <Card>
        <FilterBar
          action={base}
          search={{ value: q, placeholder: "Description or part number" }}
          fields={[
            { kind: "select", name: "supplier", label: "Supplier", all: "Any supplier", value: supplier, options: supplierOpts },
            { kind: "select", name: "show", label: "Show", all: "Current only", value: showArchived ? "archived" : "", options: [{ value: "archived", label: "Including archived" }] },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title={all.length ? "No parts match" : "No parts in the catalogue yet"}>{all.length ? null : "Add the parts you order often."}</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Part</TH>
                <TH>Unit</TH>
                <TH>Usual price</TH>
                <TH>Usual supplier</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <span className="font-semibold">{c.description}</span>
                    {c.archived_at ? (
                      <Badge tone="grey" className="ml-2">
                        Archived
                      </Badge>
                    ) : null}
                    {c.part_number ? <span className="block font-mono text-[12.5px] text-ink-muted">{c.part_number}</span> : null}
                  </TD>
                  <TD>{c.unit}</TD>
                  <TD>{aud(c.default_unit_cost_cents)}</TD>
                  <TD>{c.supplier_id ? (supplierName.get(c.supplier_id) ?? "—") : "—"}</TD>
                  <TD className="text-right">
                    <CatalogueDialog
                      orgId={orgId}
                      suppliers={supplierOpts}
                      part={{
                        id: c.id,
                        part_number: c.part_number ?? "",
                        description: c.description,
                        unit: c.unit,
                        default_unit_cost: c.default_unit_cost_cents !== null ? (c.default_unit_cost_cents / 100).toFixed(2) : "",
                        supplier_id: c.supplier_id ?? "",
                        archived: !!c.archived_at,
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
