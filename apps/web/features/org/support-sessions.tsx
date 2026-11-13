"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ownerEndSupportAccessAction } from "./actions";
import { confirmDialog } from "@/components/ui/confirm";

export function EndSupportButton({ portal, orgId, grantId }: { portal: string; orgId: string; grantId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmDialog({ title: "End HVEMS support access now?", description: "HVEMS staff will no longer see your records.", confirmLabel: "End access" }))) return;
        start(async () => {
          const res = await ownerEndSupportAccessAction(portal, orgId, grantId);
          if (res.status === "success") toast.success(res.message ?? "Ended");
          else if (res.status === "error") toast.error(res.message);
          router.refresh();
        });
      }}
    >
      {pending ? "Ending…" : "End now"}
    </Button>
  );
}
