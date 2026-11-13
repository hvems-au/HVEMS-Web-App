import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardList, ClipboardCheck, Hammer, MessageSquareWarning, Wrench } from "lucide-react";
import { formatWorkOrderNumber, listMyJobs, listReportKinds, listUnassignedJobs, type WorkOrder } from "@hvems/api-client";
import { formatDateTimeAU, todayISO } from "@hvems/domain";
import { can } from "@hvems/permissions";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { PriorityBadge } from "@/features/maintenance/badges";
import { STAGE_TEXT, jobStage, type JobStage } from "@/features/technician/job";
import { loadOrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Jobs" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const STAGE_TONE: Record<JobStage, "blue" | "orange" | "amber" | "green" | "grey"> = { pre: "blue", work: "orange", review: "amber", done: "green", cancelled: "grey" };
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/**
 * The technician's home: jobs assigned to them (what to do next on each),
 * jobs nobody has taken, recent completed work, and quick pre-start / issue.
 */
export default async function MyWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, sp] = await Promise.all([params, searchParams]);
  const reported = typeof sp.reported === "string" ? sp.reported : null;
  const ctx = await loadOrgContext(orgId, ["company"]);
  if (!can(ctx.capabilities, "work_orders.work")) notFound();
  const db = await createSupabaseServerClient();
  const [mine, unassigned] = await Promise.all([listMyJobs(db, orgId, ctx.user.id), listUnassignedJobs(db, orgId)]);
  const kinds = await listReportKinds(db, mine.filter((w) => w.status === "open" || w.status === "in_progress").map((w) => w.id));
  const today = todayISO(ctx.timezone);
  const base = `/customer/${orgId}/my-work`;

  const active = mine
    .filter((w) => w.status === "open" || w.status === "in_progress")
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
  const review = mine.filter((w) => w.status === "completed");
  const done = mine.filter((w) => w.status === "closed").slice(0, 10);
  const monthStart = today.slice(0, 7);
  const doneThisMonth = mine.filter((w) => (w.status === "closed" || w.status === "completed") && (w.completed_at ?? "").slice(0, 7) === monthStart).length;
  const overdue = active.filter((w) => w.due_on && w.due_on < today).length;
  const firstName = (ctx.user.fullName ?? "").split(/[\s-]/)[0];

  const actions = [
    { href: `${base}/equipment?for=prestart`, label: "Start pre-start", help: "Check a vehicle or machine before you use it", Icon: ClipboardCheck, primary: true },
    { href: `${base}/equipment?for=issue`, label: "Report an issue", help: "Found a fault? Tell the managers", Icon: MessageSquareWarning, primary: false },
  ];

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[24px] leading-tight font-bold text-ink sm:text-[28px]">{firstName ? `G'day, ${firstName}` : "My Jobs"}</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          {active.length
            ? `${active.length} job${active.length === 1 ? "" : "s"} to do${overdue ? ` · ${overdue} overdue` : ""}`
            : "No jobs waiting for you right now."}
        </p>
      </div>

      {reported ? (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-[12px] border border-ok bg-ok-soft px-4 py-3 text-ok-ink">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          <p className="text-[14px]">Issue reported. It&apos;s in Defects &amp; Safety for the managers (reference {reported.slice(0, 8).toUpperCase()}).</p>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "To do", value: active.length, tone: active.length ? "text-brand-ink" : "text-ink", Icon: Wrench, href: "#my-jobs" },
          { label: "Overdue", value: overdue, tone: overdue ? "text-danger-ink" : "text-ink", Icon: CalendarClock, href: "#my-jobs" },
          { label: "Waiting for review", value: review.length, tone: "text-ink", Icon: Hammer, href: review.length ? "#review" : "#my-jobs" },
          { label: "Completed this month", value: doneThisMonth, tone: "text-ok-ink", Icon: ClipboardCheck, href: "#completed" },
        ].map((s) => (
          <a
            key={s.label}
            href={s.href}
            className="group flex items-center gap-3 rounded-[14px] border border-stroke bg-surface px-4 py-3.5 shadow-card transition-all duration-150 hover:-translate-y-px hover:border-brand/50 hover:shadow-[var(--elev-pop)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <s.Icon className="size-5 shrink-0 text-ink-subtle transition-colors group-hover:text-brand-ink" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[22px] leading-none font-bold", s.tone)}>{s.value}</p>
              <p className="mt-1 truncate text-[12.5px] text-ink-muted">{s.label}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <Card id="my-jobs" className="scroll-mt-20">
            <CardHeader title="My jobs" description="Most urgent first" />
            {active.length === 0 ? (
              <EmptyState title="Nothing assigned to you">New jobs appear here when a manager assigns them to you.</EmptyState>
            ) : (
              <ul className="divide-y divide-stroke">
                {active.map((w) => (
                  <JobRow key={w.id} w={w} href={`${base}/${w.id}`} stage={jobStage(w, kinds.get(w.id))} today={today} />
                ))}
              </ul>
            )}
          </Card>

          {review.length ? (
            <Card id="review" className="scroll-mt-20">
              <CardHeader title="Waiting for review" description="Completed by you; a manager checks and closes them. You can still add invoices." />
              <ul className="divide-y divide-stroke">
                {review.map((w) => (
                  <JobRow key={w.id} w={w} href={`${base}/${w.id}`} stage="review" today={today} />
                ))}
              </ul>
            </Card>
          ) : null}

          <Card id="completed" className="scroll-mt-20">
            <CardHeader title="Completed jobs" description="Your latest closed work" />
            {done.length === 0 ? (
              <EmptyState title="No completed jobs yet" />
            ) : (
              <ul className="divide-y divide-stroke">
                {done.map((w) => (
                  <li key={w.id}>
                    <Link href={`${base}/${w.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-ink">{w.title}</span>
                        <span className="block text-[12.5px] text-ink-muted">
                          {formatWorkOrderNumber(w.number)} · {w.asset?.asset_number} · {w.completed_at ? formatDateTimeAU(new Date(w.completed_at), ctx.timezone) : "—"}
                        </span>
                      </span>
                      <Badge tone="green">Closed</Badge>
                      <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3 self-start">
          {actions.map(({ href, label, help, Icon, primary }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-4 rounded-[14px] px-4 py-3.5 shadow-card transition-all duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                primary ? "bg-brand text-white hover:bg-brand-hover" : "border border-stroke bg-surface text-ink hover:border-brand hover:bg-brand-soft",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-[11px] transition-colors",
                  primary ? "bg-white/15" : "bg-brand-soft text-brand-ink group-hover:bg-brand group-hover:text-white",
                )}
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className={primary ? "block text-[12.5px] text-white/85" : "block text-[12.5px] text-ink-muted"}>{help}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
          {unassigned.length ? (
            <Card className="mt-2">
              <CardHeader title={`Jobs nobody has taken (${unassigned.length})`} description="Open one and start it to take it." />
              <ul className="divide-y divide-stroke">
                {unassigned.slice(0, 6).map((w) => (
                  <li key={w.id}>
                    <Link href={`${base}/${w.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">{w.title}</span>
                        <span className="block text-[12.5px] text-ink-muted">
                          {w.asset?.asset_number}
                          {w.due_on ? ` · due ${dmy(w.due_on)}` : ""}
                        </span>
                      </span>
                      <PriorityBadge priority={w.priority} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {can(ctx.capabilities, "work_orders.manage") ? (
            <Button asChild variant="secondary" className="w-full justify-between">
              <Link href={`/customer/${orgId}/work-orders`}>
                <span className="flex items-center gap-2">
                  <ClipboardList /> All work orders
                </span>
                <ChevronRight />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function JobRow({ w, href, stage, today }: { w: WorkOrder; href: string; stage: JobStage; today: string }) {
  const late = w.due_on && w.due_on < today && (w.status === "open" || w.status === "in_progress");
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-surface-hover">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">{w.title}</span>
            {w.priority === "urgent" || w.priority === "high" ? <PriorityBadge priority={w.priority} /> : null}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-muted">
            {formatWorkOrderNumber(w.number)} · {w.asset?.asset_number} {[w.asset?.make, w.asset?.model].filter(Boolean).join(" ")}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
            <Badge tone={STAGE_TONE[stage]}>{STAGE_TEXT[stage].label}</Badge>
            {w.due_on ? <span className={late ? "font-semibold text-danger-ink" : "text-ink-subtle"}>{late ? "Overdue · " : "Due "}{dmy(w.due_on)}</span> : null}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}
