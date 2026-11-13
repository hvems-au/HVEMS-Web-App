"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startJobAction } from "./actions";

/** Start a job (vendor jobs; internal jobs start with the pre-work report). */
export function StartJobButton({ orgId, woId }: { orgId: string; woId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await startJobAction(orgId, woId);
          if (res.status === "error") toast.error(res.message);
          else toast.success("Job started");
          router.refresh();
        })
      }
    >
      {pending ? "Starting…" : "Start job"}
    </Button>
  );
}
