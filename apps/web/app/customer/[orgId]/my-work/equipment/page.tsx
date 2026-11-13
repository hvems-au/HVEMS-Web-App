import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ConditionBadge } from "@/components/condition";
import { Input, SEARCH_FIELD } from "@/components/ui/form";
import { Card, EmptyState } from "@/components/ui/primitives";
import { QrScanButton } from "@/features/operator/qr-scan";
import { equipmentCodeFromText } from "@/lib/equipment-code";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Choose equipment" };

type Row = {
  id: string;
  asset_number: string;
  make: string | null;
  model: string | null;
  registration_number: string | null;
  condition: "active" | "needs_attention" | "out_of_service";
  asset_class: { name: string } | null;
};

/** Pick the vehicle or machine for a pre-start or an issue report (technician workspace). */
export default async function TechEquipment({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  await loadOrgContext(orgId, ["company"]);
  const purpose = firstParam(sp.for) === "issue" ? "issue" : "prestart";
  const rawQ = (firstParam(sp.q) ?? "").trim().slice(0, 200);
  const q = rawQ.slice(0, 60);
  const home = `/customer/${orgId}/my-work`;
  const target = (id: string) => (purpose === "issue" ? `${home}/equipment/${id}/issue` : `/customer/${orgId}/equipment/${id}/prestart`);
  const db = await createSupabaseServerClient();

  // A QR label code (typed or scanned) goes straight to the equipment.
  const code = equipmentCodeFromText(rawQ);
  if (code) {
    const match = [code.shortCode ? `short_code.eq.${code.shortCode}` : null, code.token ? `token.eq.${code.token}` : null].filter(Boolean).join(",");
    const { data: hit } = await db.from("equipment_codes").select("asset_id").eq("organisation_id", orgId).is("revoked_at", null).or(match).limit(1).maybeSingle();
    if (hit?.asset_id) redirect(target(hit.asset_id as string));
  }

  let query = db
    .from("assets")
    .select("id, asset_number, make, model, registration_number, condition, asset_class:asset_classes(name)")
    .eq("organisation_id", orgId)
    .is("archived_at", null);
  if (q) {
    const clean = q.replace(/[%_,()]/g, " ").trim();
    const terms = [...new Set([clean, clean.replace(/\s+/g, "")])].filter(Boolean);
    query = query.or(terms.flatMap((t) => ["asset_number", "registration_number", "make", "model", "serial_number", "vin"].map((c) => `${c}.ilike.%${t}%`)).join(","));
  }
  const { data } = await query.order("asset_number").limit(200);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={home} label="My Jobs" />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-ink">{purpose === "issue" ? "Report an issue" : "Start pre-start"}</h1>
        <QrScanButton searchPath={`${home}/equipment?for=${purpose}`} />
      </div>
      <p className="mt-0.5 mb-4 text-[14px] text-ink-muted">Choose the vehicle or machine.</p>
      <AutoFilterForm role="search" className="mb-4">
        <input type="hidden" name="for" value={purpose} />
        <span className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Rego, ID, make, model or QR code"
            aria-label="Search vehicles and equipment"
            autoComplete="off"
            enterKeyHint="search"
            className={cn("h-12 pl-10 text-[16px]", SEARCH_FIELD)}
          />
        </span>
      </AutoFilterForm>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={q ? "No equipment matches" : "No equipment yet"}>{q ? "Check the spelling, or search by rego or equipment ID." : null}</EmptyState>
        ) : (
          <ul className="divide-y divide-stroke">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={target(a.id)} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold text-ink">{a.asset_number}</span>
                    <span className="block truncate text-[13.5px] text-ink-muted">
                      {[a.make, a.model].filter(Boolean).join(" ") || a.asset_class?.name}
                      {a.registration_number ? ` · ${a.registration_number}` : ""}
                    </span>
                  </span>
                  <ConditionBadge condition={a.condition} />
                  <ChevronRight className="size-5 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
