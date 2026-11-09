import type { Metadata } from "next";
import Link from "next/link";
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
      <PageHeader title="Organisations" description="Edit an organisation's details or de-activate it. Customer records stay private: opening them requires time-limited, logged support access (increment 2D screen)." />
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
                <TH className="w-24" />
              </tr>
            </THead>
            <tbody>
              {orgs.map((o) => (
                <TR key={o.id}>
                  <TD className="font-semibold">
                    <Link href={`/admin/organisations/${o.id}`} className="hover:text-brand hover:underline">
                      {o.name}
                    </Link>
                  </TD>
                  <TD>{KIND_LABELS[o.kind as OrganisationKind]}</TD>
                  <TD>{o.abn ?? "—"}</TD>
                  <TD>
                    <Badge tone={o.status === "active" ? "green" : o.status === "restricted" ? "amber" : "red"}>{o.status === "suspended" ? "de-activated" : o.status}</Badge>
                  </TD>
                  <TD>{formatDateAU(new Date(o.created_at))}</TD>
                  <TD className="text-right">
                    <Link href={`/admin/organisations/${o.id}`} className="text-[13px] font-semibold text-link hover:underline">
                      Manage
                    </Link>
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
