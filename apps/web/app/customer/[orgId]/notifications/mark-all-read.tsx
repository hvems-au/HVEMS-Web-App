"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";

export function MarkAllRead({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
          await markAllReadAction(orgId);
          router.refresh();
        })}>
      <CheckCheck /> {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
