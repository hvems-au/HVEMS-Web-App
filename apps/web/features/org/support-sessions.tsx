"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ownerEndSupportAccessAction } from "./actions";

export function EndSupportButton({ portal, orgId, grantId }: { portal: string; orgId: string; grantId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("End HVEMS support access now? HVEMS staff will no longer see your records.")) return;
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
