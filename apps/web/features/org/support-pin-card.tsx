"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { rotateSupportPinAction } from "./actions";

/**
 * Settings → Security (Owner and Company Admins): the support PIN HVEMS staff
 * must be given before they can open a support session. It changes on its own
 * every few hours; "New PIN now" replaces it straight away.
 */
export function SupportPinCard({ portal, orgId, pin, validUntilText, rotationHours }: { portal: string; orgId: string; pin: string; validUntilText: string; rotationHours: number }) {
  const router = useRouter();
  const [shown, setShown] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Card className="mt-5 max-w-3xl">
      <CardHeader
        title="Security"
        description="HVEMS support can only open a read-only support session for your company with this PIN. Give it to them only when you ask for help."
      />
      <CardBody>
        <div className="flex flex-wrap items-center gap-4">
          <KeyRound className="size-5 text-ink-muted" aria-hidden />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Support PIN</p>
            <p className="font-mono text-[26px] font-bold tracking-[0.3em] text-ink" aria-live="polite">
              {shown ? pin : "••••••"}
            </p>
            <p className="text-[12.5px] text-ink-muted">
              Changes by itself every {rotationHours} hours. This one works until {validUntilText}.
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShown((v) => !v)}>
              {shown ? <EyeOff /> : <Eye />} {shown ? "Hide" : "Show"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await rotateSupportPinAction(portal, orgId);
                  if (res.status === "success") toast.success(res.message ?? "New PIN created");
                  else if (res.status === "error") toast.error(res.message);
                  setShown(true);
                  router.refresh();
                })
              }
            >
              <RefreshCw /> {pending ? "Changing…" : "New PIN now"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
