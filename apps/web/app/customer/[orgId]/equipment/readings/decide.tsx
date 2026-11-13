"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { decideReadingAction } from "./actions";

/** Approve (optional note) or reject (reason required) one reading. */
export function DecideReading({ orgId, readingId, label }: { orgId: string; readingId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const decide = async (accept: boolean) => {
    const note = await promptDialog({
      title: accept ? `Approve ${label}?` : `Reject ${label}?`,
      description: accept ? "It becomes the current reading for the equipment." : "It's kept in the history as rejected; the current reading doesn't change.",
      input: { label: accept ? "Note" : "Why is it rejected?", hint: accept ? "Optional, e.g. Instrument cluster replaced" : "e.g. Typing error; operator asked to re-enter", required: !accept },
      confirmLabel: accept ? "Approve" : "Reject",
      danger: !accept,
    });
    if (note === null) return;
    start(async () => {
      const res = await decideReadingAction(orgId, readingId, accept, note);
      if (res.status === "error") toast.error(res.message);
      else toast.success(res.status === "success" ? (res.message ?? "Saved") : "Saved");
      router.refresh();
    });
  };
  return (
    <span className="flex justify-end gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(false)}>
        <X /> Reject
      </Button>
      <Button size="sm" disabled={pending} onClick={() => decide(true)}>
        <Check /> Approve
      </Button>
    </span>
  );
}
