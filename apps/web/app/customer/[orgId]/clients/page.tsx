import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Mail, MapPin, Phone, Search } from "lucide-react";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Input, SEARCH_FIELD } from "@/components/ui/form";
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
  const sp = await searchParams;
  const tab = firstParam(sp.tab) === "sites" ? "sites" : "clients";
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const ctx = await loadOrgContext(orgId, ["company"]);
  await requireCapability(ctx, "clients.view");
  const db = await createSupabaseServerClient();
  const [clients, sites, equipment] = await Promise.all([
    listClients(db, orgId),
    listSites(db, orgId),
    db
      .from("assets")
      .select("client_id, site_id")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .limit(5000)
      .then((r) => (r.data ?? []) as { client_id: string | null; site_id: string | null }[]),
  ]);
  const equipmentFor = (key: "client_id" | "site_id", id: string) => equipment.filter((a) => a[key] === id).length;
  // Search (as you type): any part of the name, ABN, contact, email, phone, address or notes.
  const needle = q.toLowerCase();
  const hit = (...parts: (string | null | undefined)[]) => !needle || parts.some((x) => (x ?? "").toLowerCase().includes(needle));
  const shownClients = clients.filter((c) => hit(c.name, c.abn, c.contact_name, c.contact_email, c.contact_phone, c.address, c.notes));
  const siteAddress = (x: (typeof sites)[number]) =>
    [x.address_line1, x.address_line2, [x.suburb, x.state, x.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const shownSites = sites.filter((x) => hit(x.name, siteAddress(x), x.client_id ? clientName.get(x.client_id) : "Own site", x.contact_name));
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
              className={cn("-mb-px border-b-2 px-2.5 pb-2.5 text-[13px] font-medium capitalize", tab === t ? "border-brand text-brand-ink" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {t} ({t === "clients" ? clients.length : sites.length})
            </Link>
          ))}
        </nav>
        <AutoFilterForm action={base} className="flex flex-wrap items-center gap-3 border-b border-stroke p-4">
          {tab === "sites" ? <input type="hidden" name="tab" value="sites" /> : null}
          <span className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input
              name="q"
              defaultValue={q}
              placeholder={tab === "sites" ? "Site, address, client or contact" : "Client, ABN, contact, address"}
              aria-label={tab === "sites" ? "Search sites" : "Search clients"}
              autoComplete="off"
              enterKeyHint="search"
              className={cn("h-10 pl-9 text-[13.5px]", SEARCH_FIELD)}
            />
          </span>
          {q ? (
            <p className="text-[13px] text-ink-muted" aria-live="polite">
              {tab === "sites" ? shownSites.length : shownClients.length} of {tab === "sites" ? sites.length : clients.length} match ·{" "}
              <Link href={tab === "sites" ? `${base}?tab=sites` : base} className="font-medium text-link hover:underline">
                Clear
              </Link>
            </p>
          ) : null}
        </AutoFilterForm>
        {tab === "clients" ? (
          clients.length === 0 ? (
            <EmptyState icon={<Building2 />} title="No clients yet">
              Workshops and contractors can keep client records and link client-owned equipment to them.
            </EmptyState>
          ) : shownClients.length === 0 ? (
            <EmptyState title="No clients match">Try part of the name, ABN, contact or address.</EmptyState>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Client</TH>
                  <TH>Address</TH>
                  <TH>Contact</TH>
                  <TH>Sites</TH>
                  <TH>Equipment</TH>
                  {canEditClients ? <TH className="w-24" /> : null}
                </tr>
              </THead>
              <tbody>
                {shownClients.map((c) => (
                  <TR key={c.id}>
                    <TD className="max-w-[260px]">
                      <span className="font-semibold text-ink">{c.name}</span>
                      {c.abn ? <span className="block text-[12.5px] text-ink-muted">ABN {c.abn}</span> : null}
                      {c.notes ? <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-subtle">{c.notes}</span> : null}
                    </TD>
                    <TD className="max-w-[240px]">
                      {c.address ? (
                        <span className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                          <span className="whitespace-pre-line">{c.address}</span>
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </TD>
                    <TD>
                      <span className="font-medium">{c.contact_name ?? "—"}</span>
                      {c.contact_email ? (
                        <a href={`mailto:${c.contact_email}`} className="relative z-10 mt-0.5 flex items-center gap-1 text-[12.5px] text-link hover:underline">
                          <Mail className="size-3.5" aria-hidden /> {c.contact_email}
                        </a>
                      ) : null}
                      {c.contact_phone ? (
                        <a href={`tel:${c.contact_phone.replace(/\s+/g, "")}`} className="relative z-10 mt-0.5 flex items-center gap-1 text-[12.5px] text-link hover:underline">
                          <Phone className="size-3.5" aria-hidden /> {c.contact_phone}
                        </a>
                      ) : null}
                    </TD>
                    <TD>{sites.filter((s) => s.client_id === c.id).length}</TD>
                    <TD>{equipmentFor("client_id", c.id)}</TD>
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
            Record depots, workshops and client sites with their address, timezone, contact and access and safety instructions.
          </EmptyState>
        ) : shownSites.length === 0 ? (
          <EmptyState title="No sites match">Try part of the site name, address, client or contact.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Site</TH>
                <TH>Client</TH>
                <TH>Location</TH>
                <TH>Contact</TH>
                <TH>Equipment</TH>
                {canEditSites ? <TH className="w-24" /> : null}
              </tr>
            </THead>
            <tbody>
              {shownSites.map((s) => (
                <TR key={s.id}>
                  <TD className="font-semibold">{s.name}</TD>
                  <TD>{s.client_id ? clientName.get(s.client_id) : "Own site"}</TD>
                  <TD>
                    {siteAddress(s) || "—"}
                    <span className="block text-[12px] text-ink-subtle">{s.timezone.replace("Australia/", "")} time</span>
                  </TD>
                  <TD>{s.contact_name ?? "—"}</TD>
                  <TD>{equipmentFor("site_id", s.id)}</TD>
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
