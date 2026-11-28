"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, CreditCard, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { cancelFeeAcceptanceAction, retryProviderFeeAction } from "./engagement-actions";

function useCountdown(until: string): string {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return "";
  const mins = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60000));
  if (mins === 0) return "less than a minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Poster side: the acceptance is waiting on the provider's connection fee (SoW 4.5). */
export function PosterPendingFees({ attemptId, providerName, pendingUntil, canCancel }: { attemptId: string; providerName: string; pendingUntil: string; canCancel: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const left = useCountdown(pendingUntil);
  return (
    <div role="status" className="mb-5 flex flex-col gap-3 rounded-[12px] border border-warn-line bg-warn-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-warn-ink" aria-hidden />
        <div>
          <p className="text-[15px] font-semibold text-ink">Acceptance pending fees</p>
          <p className="text-[13.5px] text-ink-muted">
            You accepted {providerName}&apos;s proposal, but their connection fee didn&apos;t go through. They have {left || "a little time"} to update their card. Your fee is
            only held, not charged: if they don&apos;t pay, the hold is released and the job opens again.
          </p>
        </div>
      </div>
      {canCancel ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            const ok = await confirmDialog({
              title: "Cancel this acceptance?",
              description: "Nothing is charged and your hold is released. The job goes back to open so you can accept another proposal.",
              confirmLabel: "Cancel acceptance",
              danger: true,
            });
            if (!ok) return;
            setBusy(true);
            const res = await cancelFeeAcceptanceAction(attemptId);
            setBusy(false);
            if (res.status === "error") return toast.error(res.message);
            toast.success("Acceptance cancelled: nothing was charged");
            router.refresh();
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <XCircle />} Cancel acceptance
        </Button>
      ) : null}
    </div>
  );
}

/** Provider side: pay the connection fee within the window to confirm the engagement. */
export function ProviderPendingFee({
  portalBase,
  attemptId,
  feeText,
  pendingUntil,
  lastError,
  canPay,
}: {
  portalBase: string;
  attemptId: string;
  feeText: string;
  pendingUntil: string;
  lastError: string | null;
  canPay: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const left = useCountdown(pendingUntil);
  return (
    <div role="alert" className="mb-5 rounded-[12px] border border-danger-line bg-danger-soft px-5 py-4">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-danger-ink">The customer accepted your proposal: pay your connection fee to confirm</p>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            Your {feeText} connection fee was declined{lastError ? ` (${lastError})` : ""}. Update your card and pay within {left || "the time left"}, or the acceptance lapses and nothing
            is charged to either of you.
          </p>
          {canPay ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await retryProviderFeeAction(attemptId);
                  setBusy(false);
                  if (res.status === "error") return toast.error(res.message);
                  if (res.status !== "success") return;
                  toast.success(res.message ?? "Paid: the engagement is confirmed");
                  router.push(res.data?.engagementId ? `${portalBase}/engagements/${res.data.engagementId}` : `${portalBase}/engagements`);
                }}
              >
                {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay {feeText} now
              </Button>
              <Button variant="secondary" asChild>
                <Link href={`${portalBase}/billing`}>Update card</Link>
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-ink-muted">Ask your Provider Owner or billing contact to update the card and pay.</p>
          )}
        </div>
      </div>
    </div>
  );
}
