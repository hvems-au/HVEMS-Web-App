"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { decideCaseAction, removeReviewAction } from "./engagement-actions";

/** HVEMS decides a case. An upheld no-show cancels the engagement, adds a strike and reopens the job. */
export function CaseDecision({ caseId, noShow }: { caseId: string; noShow: boolean }) {
  const router = useRouter();
  const [outcome, setOutcome] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const decide = async (upheld: boolean) => {
    setError(null);
    setBusy(true);
    const res = await decideCaseAction(caseId, upheld, outcome);
    setBusy(false);
    if (res.status === "error") return setError(res.message);
    toast.success("Case decided");
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field label="Outcome" htmlFor="case-outcome" hint="Shown to both parties">
        <Textarea id="case-outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={2000} />
      </Field>
      {noShow ? <p className="text-[13px] text-ink-muted">Upholding a no-show cancels the engagement, records a strike and reopens the job for the customer.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => decide(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <Gavel />} Uphold
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => decide(false)}>
          Don&apos;t uphold
        </Button>
      </div>
    </div>
  );
}

export function RemoveReviewButton({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        const reason = await promptDialog({ title: "Remove this review?", description: "It's hidden from everyone and kept for audit.", input: { label: "Guideline breached", required: true }, confirmLabel: "Remove", danger: true });
        if (!reason) return;
        const res = await removeReviewAction(engagementId, reason);
        if (res.status === "error") toast.error(res.message);
        else toast.success("Review removed");
        router.refresh();
      }}
    >
      Remove
    </Button>
  );
}
