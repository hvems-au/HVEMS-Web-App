"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { assignCaseAction, caseNoteAction, decideCaseAction, removeReviewAction } from "./engagement-actions";

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

/** Case owner and internal notes (ADM-05). Notes are for HVEMS staff only. */
export function CaseOwnerNotes({ caseId, ownerName, isMine, myId }: { caseId: string; ownerName: string | null; isMine: boolean; myId: string }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const run = async (p: Promise<{ status: string; message?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (res.status === "error") toast.error(res.message ?? "Something went wrong");
    else toast.success(res.message ?? "Done");
    router.refresh();
    return res.status !== "error";
  };
  return (
    <div className="flex flex-col gap-3 text-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Owner: <span className="font-medium">{ownerName ?? "Nobody yet"}</span>
        </span>
        {!isMine ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(assignCaseAction(caseId, myId))}>
            Assign to me
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(assignCaseAction(caseId, null))}>
            Remove me
          </Button>
        )}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(caseNoteAction(caseId, note))) setNote("");
        }}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Internal note (HVEMS staff only)" aria-label="Internal note" />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || note.trim().length < 2} className="self-start">
          Add note
        </Button>
      </form>
    </div>
  );
}
