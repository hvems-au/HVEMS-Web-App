import { Check } from "lucide-react";
import type { WorkOrder } from "@hvems/api-client";
import { cn } from "@/lib/utils";

export type JobStage = "pre" | "work" | "review" | "done" | "cancelled";

/** Where a job is up to, for the technician. */
export function jobStage(w: Pick<WorkOrder, "status" | "kind">, kinds: Set<"pre" | "post"> | undefined): JobStage {
  if (w.status === "cancelled") return "cancelled";
  if (w.status === "closed") return "done";
  if (w.status === "completed") return "review";
  if (w.kind === "internal" && !kinds?.has("pre")) return "pre";
  return "work";
}

export const STAGE_TEXT: Record<JobStage, { label: string; next: string }> = {
  pre: { label: "Pre-work report needed", next: "Check the equipment and file the pre-work report to start." },
  work: { label: "In progress", next: "When the work is finished, file the post-work report to complete the job." },
  review: { label: "Waiting for review", next: "A manager checks the reports and closes the job. You can still add invoices." },
  done: { label: "Closed", next: "Reviewed and closed." },
  cancelled: { label: "Cancelled", next: "This job was cancelled." },
};

const STEPS: { stage: JobStage; label: string }[] = [
  { stage: "pre", label: "Pre-work report" },
  { stage: "work", label: "Work and post-work report" },
  { stage: "review", label: "Manager review" },
  { stage: "done", label: "Closed" },
];
const ORDER: Record<JobStage, number> = { pre: 0, work: 1, review: 2, done: 3, cancelled: -1 };

/** Four-step progress bar at the top of a job. */
export function JobSteps({ stage }: { stage: JobStage }) {
  if (stage === "cancelled") return null;
  const at = ORDER[stage];
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Job progress">
      {STEPS.map((s, i) => {
        const done = i < at || stage === "done";
        const current = i === at && stage !== "done";
        return (
          <li key={s.stage} className="flex flex-col gap-1.5" aria-current={current ? "step" : undefined}>
            <span className={cn("h-1.5 rounded-full", done ? "bg-ok" : current ? "bg-brand" : "bg-surface-muted")} />
            <span className={cn("flex items-center gap-1 text-[12px] leading-tight sm:text-[12.5px]", current ? "font-semibold text-ink" : done ? "text-ok-ink" : "text-ink-subtle")}>
              {done ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
