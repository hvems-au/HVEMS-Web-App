"use client";
import * as React from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "./actions";

export function MarkAllRead({ orgId }: { orgId: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(async () => void (await markAllReadAction(orgId)))}>
      <CheckCheck /> {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
