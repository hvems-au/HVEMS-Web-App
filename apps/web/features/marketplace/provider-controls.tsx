"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, BookmarkCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { saveJobAction, withdrawProposalAction } from "./actions";

export function SaveJobButton({ providerId, jobId, saved }: { providerId: string; jobId: string; saved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await saveJobAction(providerId, jobId, !saved);
        setBusy(false);
        if (res.status === "error") toast.error(res.message);
        router.refresh();
      }}
    >
      {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? "Saved" : "Save"}
    </Button>
  );
}

export function WithdrawProposalButton({ providerId, proposalId }: { providerId: string; proposalId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        if (!(await confirmDialog({ title: "Withdraw your proposal?", description: "The customer can no longer accept it. You can submit a new one while the job is open.", confirmLabel: "Withdraw" })))
          return;
        const res = await withdrawProposalAction(providerId, proposalId);
        if (res.status === "error") toast.error(res.message);
        else toast.success("Proposal withdrawn");
        router.refresh();
      }}
    >
      <Undo2 /> Withdraw
    </Button>
  );
}
