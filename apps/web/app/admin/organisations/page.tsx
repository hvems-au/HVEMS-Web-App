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
  let q = db
    .from("organisations")
    .select("id, kind, name, abn, status, created_at, members:org_memberships(count), equipment:assets(count)")
    .eq("members.status", "active")
    .is("equipment.archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  const orgs = (data ?? []) as unknown as {
    id: string;
    kind: OrganisationKind;
    name: string;
    abn: string | null;
    status: string;
    created_at: string;
    members: { count: number }[];
    equipment: { count: number }[];
  }[];
  return (
    <>
      <PageHeader title="Organisations" description="Every organisation on HVEMS. Open one to see its team and fleet, edit its details or de-activate it. Each time you open a company's team or fleet, it's recorded in that company's security log." />
      <Card>
        {!orgs.length ? (
          <EmptyState title="No organisations yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH>ABN</TH>
                <TH>Status</TH>
                <TH className="text-right">Members</TH>
                <TH className="text-right">Equipment</TH>
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
                  <TD className="text-right">{o.members[0]?.count ?? 0}</TD>
                  <TD className="text-right">{o.kind === "company" ? (o.equipment[0]?.count ?? 0) : "—"}</TD>
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
