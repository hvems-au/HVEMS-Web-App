"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeAlertAction } from "../defects/actions";

export function AcknowledgeButton({ orgId, alertId }: { orgId: string; alertId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acknowledgeAlertAction(orgId, alertId);
          if (res.status === "success") {
            toast.success("Acknowledged");
            router.refresh();
          } else if (res.status === "error") toast.error(res.message);
        })
      }
    >
      <Check /> {pending ? "Acknowledging…" : "Acknowledge"}
    </Button>
  );
}
