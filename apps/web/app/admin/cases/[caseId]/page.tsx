import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMarketplaceCase, getPersonNames } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { CaseDecision } from "@/features/marketplace/case-decision";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Case" };

const CATEGORY: Record<string, string> = { no_show: "No-show", conduct: "Conduct", safety: "Safety concern", fee: "Fee", strike_review: "Strike review", other: "Other" };

/** One case with its history and the decision. */
export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const db = await createSupabaseServerClient();
  const data = await getMarketplaceCase(db, caseId);
  if (!data) notFound();
  const c = data.case;
  const names = await getPersonNames(db, data.events.map((e) => e.actor_id));
  const [engagement, strikes] = await Promise.all([
    c.engagement_id ? db.from("marketplace_engagements").select("number, status, accepted_at, job:marketplace_jobs(title, number)").eq("id", c.engagement_id).maybeSingle() : Promise.resolve({ data: null }),
    c.provider_id ? db.from("provider_strikes").select("id, reason, created_at").eq("provider_id", c.provider_id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const eng = engagement.data as { number: number; status: string; accepted_at: string; job: { title: string; number: number } | null } | null;
  const open = c.status === "awaiting_response" || c.status === "under_review";

  return (
    <>
      <PageHeader
        title={`Case ${c.number}: ${CATEGORY[c.category]}`}
        description={`${c.provider?.name ?? "Provider"}${eng ? ` · engagement ${eng.number} (${eng.job?.title ?? "job"})` : ""}`}
        breadcrumb={{ label: "Cases", href: "/admin/cases" }}
        actions={<Badge tone={open ? "amber" : c.upheld ? "red" : "green"}>{open ? (c.status === "awaiting_response" ? "Waiting for a response" : "Ready to decide") : c.upheld ? "Upheld" : "Not upheld"}</Badge>}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Card>
            <CardHeader title="What was raised" />
            <CardBody className="flex flex-col gap-3 pt-0 text-[14px]">
              <p className="whitespace-pre-wrap">{c.description}</p>
              <p className="text-ink-muted">
                Raised by {c.raised_by_side === "poster" ? "the customer" : c.raised_by_side === "provider" ? "the provider" : "HVEMS"} on {formatDateTimeAU(new Date(c.created_at))}
                {c.respond_by && c.status === "awaiting_response" ? `. The other party has until ${formatDateTimeAU(new Date(c.respond_by))} to respond.` : "."}
              </p>
              {c.response ? (
                <div className="rounded-[10px] border border-stroke p-3">
                  <p className="text-[12.5px] text-ink-subtle">Response {c.responded_at ? formatDateTimeAU(new Date(c.responded_at)) : ""}</p>
                  <p className="whitespace-pre-wrap">{c.response}</p>
                </div>
              ) : null}
              {c.outcome ? <p className="font-medium">Outcome: {c.outcome}</p> : null}
            </CardBody>
          </Card>
          {open ? (
            <Card>
              <CardHeader title="Decision" />
              <CardBody className="pt-0">
                <CaseDecision caseId={c.id} noShow={c.category === "no_show"} />
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="History" />
            <CardBody className="pt-0">
              <ul className="flex flex-col gap-2 text-[13.5px]">
                {data.events.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium">{e.event.replaceAll("_", " ")}</span> · {e.actor_id ? (names.get(e.actor_id) ?? "—") : "System"} · {formatDateTimeAU(new Date(e.created_at))}
                    {e.note ? <span className="block text-ink-muted">{e.note}</span> : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Strikes (${(strikes.data ?? []).length})`} description="Provider cancellations and upheld no-shows" />
            <CardBody className="pt-0">
              <ul className="flex flex-col gap-1 text-[13.5px]">
                {((strikes.data ?? []) as { id: string; reason: string; created_at: string }[]).map((s) => (
                  <li key={s.id}>
                    {s.reason === "no_show" ? "No-show" : "Provider cancellation"} · {formatDateTimeAU(new Date(s.created_at))}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
