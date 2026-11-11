import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin } from "lucide-react";
import { listClients, listSites } from "@hvems/api-client";
import { can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import { Card, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { loadOrgContext, requireCapability } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";
import { EditClientDialog, EditSiteDialog, NewClientDialog, NewSiteDialog } from "./dialogs";

export const metadata: Metadata = { title: "Clients & Sites" };

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const tab = firstParam((await searchParams).tab) === "sites" ? "sites" : "clients";
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "clients.view");
  const db = await createSupabaseServerClient();
  const [clients, sites] = await Promise.all([listClients(db, orgId), listSites(db, orgId)]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const base = `/customer/${orgId}/clients`;
  const canEditClients = can(ctx.capabilities, "clients.manage");
  const canEditSites = can(ctx.capabilities, "sites.manage");

  return (
    <>
      <PageHeader
        title="Clients & Sites"
        description="Your clients and the sites where work happens."
        actions={
          <>
            {can(ctx.capabilities, "sites.manage") ? <NewSiteDialog orgId={orgId} clients={clients} /> : null}
            {can(ctx.capabilities, "clients.manage") ? <NewClientDialog orgId={orgId} /> : null}
          </>
        }
      />
      <Card>
        <nav className="flex gap-1 border-b border-stroke px-4 pt-3" aria-label="Clients or sites">
          {(["clients", "sites"] as const).map((t) => (
            <Link
              key={t}
              href={t === "sites" ? `${base}?tab=sites` : base}
              aria-current={tab === t ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-2.5 pb-2.5 text-[13px] font-medium capitalize", tab === t ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t} ({t === "clients" ? clients.length : sites.length})
            </Link>
          ))}
        </nav>
        {tab === "clients" ? (
          clients.length === 0 ? (
            <EmptyState icon={<Building2 />} title="No clients yet">
              Workshops and contractors can keep client records and link client-owned equipment to them.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Client</TH>
                  <TH>ABN</TH>
                  <TH>Contact</TH>
                  <TH>Sites</TH>
                  {canEditClients ? <TH className="w-24" /> : null}
                </tr>
              </THead>
              <tbody>
                {clients.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-semibold">{c.name}</TD>
                    <TD>{c.abn ?? "—"}</TD>
                    <TD>
                      {c.contact_name ?? "—"}
                      <span className="block text-[12px] text-ink-subtle">{[c.contact_email, c.contact_phone].filter(Boolean).join(" · ")}</span>
                    </TD>
                    <TD>{sites.filter((s) => s.client_id === c.id).length}</TD>
                    {canEditClients ? (
                      <TD className="text-right">
                        <EditClientDialog orgId={orgId} client={c} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : sites.length === 0 ? (
          <EmptyState icon={<MapPin />} title="No sites yet">
            Record depots, workshops and client sites with their timezone, shift times and access and safety instructions.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Site</TH>
                <TH>Client</TH>
                <TH>Location</TH>
                <TH>Shift times</TH>
                <TH>Contact</TH>
                {canEditSites ? <TH className="w-24" /> : null}
              </tr>
            </THead>
            <tbody>
              {sites.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold">{s.name}</TD>
                  <TD>{s.client_id ? clientName.get(s.client_id) : "Own site"}</TD>
                  <TD>
                    {[s.suburb, s.state, s.postcode].filter(Boolean).join(" ") || "—"}
                    <span className="block text-[12px] text-ink-subtle">{s.timezone.replace("Australia/", "")} time</span>
                  </TD>
                  <TD className="max-w-[220px] truncate">{s.shift_times ?? "—"}</TD>
                  <TD>{s.contact_name ?? "—"}</TD>
                  {canEditSites ? (
                    <TD className="text-right">
                      <EditSiteDialog orgId={orgId} clients={clients} site={s} />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
