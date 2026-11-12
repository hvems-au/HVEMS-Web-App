import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ConditionBadge } from "@/components/condition";
import { Card, EmptyState } from "@/components/ui/primitives";
import { loadOperatorContext } from "@/features/operator/context";
import { OperatorEquipmentSearch } from "@/features/operator/equipment-search";
import { equipmentCodeFromText } from "@/lib/equipment-code";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Vehicles & equipment" };

type Row = {
  id: string;
  asset_number: string;
  make: string | null;
  model: string | null;
  registration_number: string | null;
  registration_state: string | null;
  condition: "active" | "needs_attention" | "out_of_service";
  asset_class: { name: string } | null;
};

/**
 * Find a vehicle or machine. Shows the company's equipment the operator may use
 * (RLS: company-wide or per-operator, per the company's setting). Used for both
 * "Start pre-start" (?for=prestart) and "Report an issue" (?for=issue).
 */
export default async function OperatorEquipment({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const base = `/driver/o/${orgId}`;
  const purpose = firstParam(sp.for) === "prestart" ? "prestart" : firstParam(sp.for) === "issue" ? "issue" : null;
  const rawQ = (firstParam(sp.q) ?? "").trim().slice(0, 200);
  const code = equipmentCodeFromText(rawQ);
  const q = rawQ.slice(0, 60);
  const cls = firstParam(sp.class) ?? "";
  await loadOperatorContext(orgId, `${base}/equipment${purpose ? `?for=${purpose}` : ""}`);
  const db = await createSupabaseServerClient();
  const target = (id: string) => (purpose === "prestart" ? `${base}/equipment/${id}/prestart` : purpose === "issue" ? `${base}/equipment/${id}/report` : `${base}/equipment/${id}`);

  // A QR label code (typed, with or without dashes, or scanned): straight to that
  // equipment. RLS only returns codes for equipment this operator may use.
  if (code) {
    const match = [code.shortCode ? `short_code.eq.${code.shortCode}` : null, code.token ? `token.eq.${code.token}` : null].filter(Boolean).join(",");
    const { data: hit } = await db.from("equipment_codes").select("asset_id, asset:assets!inner(archived_at)").eq("organisation_id", orgId).is("revoked_at", null).is("asset.archived_at", null).or(match).limit(1).maybeSingle();
    if (hit?.asset_id) redirect(target(hit.asset_id as string));
  }

  let query = db
    .from("assets")
    .select("id, asset_number, make, model, registration_number, registration_state, condition, asset_class:asset_classes(name)")
    .eq("organisation_id", orgId)
    .is("archived_at", null);
  if (q) {
    // Case-insensitive, partial, and spacing-tolerant for registrations ("ABC 123" finds "ABC123").
    const clean = q.replace(/[%_,()]/g, " ").trim();
    const squashed = clean.replace(/\s+/g, "");
    const terms = [...new Set([clean, squashed])].filter(Boolean);
    query = query.or(
      terms.flatMap((t) => ["asset_number", "registration_number", "make", "model", "serial_number", "vin"].map((c) => `${c}.ilike.%${t}%`)).join(","),
    );
  }
  if (cls) query = query.eq("asset_class_id", cls);
  const [{ data }, classes] = await Promise.all([
    query.order("asset_number").limit(200),
    db
      .from("assets")
      .select("asset_class_id, asset_class:asset_classes(name)")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .limit(2000)
      .then((r) => {
        const seen = new Map<string, string>();
        for (const a of (r.data ?? []) as unknown as { asset_class_id: string; asset_class: { name: string } | null }[]) {
          if (a.asset_class) seen.set(a.asset_class_id, a.asset_class.name);
        }
        return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
      }),
  ]);
  // Exact equipment ID or registration matches first.
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => rank(b, q) - rank(a, q));
  return (
    <>
      <h1 className="text-[22px] font-bold text-ink">
        {purpose === "prestart" ? "Start pre-start" : purpose === "issue" ? "Report an issue" : "Vehicles & equipment"}
      </h1>
      <p className="mt-0.5 mb-4 text-[14px] text-ink-muted">
        {purpose ? "Choose the vehicle or machine." : "Find a vehicle or machine to do a pre-start or report an issue."}
      </p>
      <OperatorEquipmentSearch key={purpose ?? "all"} purpose={purpose} q={q} cls={cls} classes={classes} />
      <Card>
        {rows.length === 0 ? (
          q || cls ? (
            code ? (
              <EmptyState title="No equipment for that code">The QR code may have been replaced, or the equipment isn&apos;t one you can use. Search by rego or equipment ID, or ask your manager.</EmptyState>
            ) : (
              <EmptyState title="No equipment matches">Check the spelling, or search by rego, equipment ID or the code under the QR label.</EmptyState>
            )
          ) : (
            <EmptyState title="No equipment yet">Your company hasn&apos;t added any equipment you can use. Ask your manager.</EmptyState>
          )
        ) : (
          <ul className="divide-y divide-stroke">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={target(a.id)} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold text-ink">{a.asset_number}</span>
                    <span className="block truncate text-[13.5px] text-ink-muted">
                      {[a.make, a.model].filter(Boolean).join(" ") || a.asset_class?.name}
                      {a.registration_number ? ` · ${a.registration_number}${a.registration_state ? ` ${a.registration_state}` : ""}` : ""}
                    </span>
                    {a.make || a.model ? <span className="block text-[12.5px] text-ink-subtle">{a.asset_class?.name}</span> : null}
                  </span>
                  <ConditionBadge condition={a.condition} />
                  <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {rows.length === 200 ? <p className="mt-3 text-[13px] text-ink-muted">Showing the first 200. Search to narrow it down.</p> : null}
    </>
  );
}

function rank(a: Row, q: string) {
  if (!q) return 0;
  const n = q.replace(/\s+/g, "").toUpperCase();
  if (a.asset_number.toUpperCase() === n || (a.registration_number ?? "").replace(/\s+/g, "") === n) return 2;
  if (a.asset_number.toUpperCase().startsWith(n) || (a.registration_number ?? "").startsWith(n)) return 1;
  return 0;
}
