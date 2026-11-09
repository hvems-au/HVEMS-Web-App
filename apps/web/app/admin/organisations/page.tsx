import type { Metadata } from "next";
import { formatDateAU } from "@hvems/domain";
import { KIND_LABELS, type OrganisationKind } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrganisationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const kind = firstParam((await searchParams).kind) as OrganisationKind | undefined;
  const db = await createSupabaseServerClient();
  let q = db.from("organisations").select("id, kind, name, abn, status, created_at").order("created_at", { ascending: false }).limit(200);
  if (kind) q = q.eq("kind", kind);
  const { data: orgs } = await q;
  return (
    <>
      <PageHeader title="Organisations" description="Customer records stay private: opening one requires time-limited, logged support access (increment 2D screen)." />
      <Card>
        {!orgs?.length ? (
          <EmptyState title="No organisations yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH>ABN</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
              </tr>
            </THead>
            <tbody>
              {orgs.map((o) => (
                <TR key={o.id}>
                  <TD className="font-semibold">{o.name}</TD>
                  <TD>{KIND_LABELS[o.kind as OrganisationKind]}</TD>
                  <TD>{o.abn ?? "—"}</TD>
                  <TD>
                    <Badge tone={o.status === "active" ? "green" : o.status === "restricted" ? "amber" : "red"}>{o.status}</Badge>
                  </TD>
                  <TD>{formatDateAU(new Date(o.created_at))}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
