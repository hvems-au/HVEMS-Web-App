"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { setCostRateAction } from "./actions";

/** A technician's hourly cost rate (cost readers only); labour on closed work orders uses it. */
export function CostRateField({ orgId, userId, cents }: { orgId: string; userId: string; cents: number | null }) {
  const router = useRouter();
  const [value, setValue] = React.useState(cents === null ? "" : (cents / 100).toFixed(2));
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await setCostRateAction(orgId, userId, value);
        setBusy(false);
        if (res.status === "error") toast.error(res.message);
        else {
          toast.success("Cost rate saved");
          router.refresh();
        }
      }}
    >
      <span className="text-ink-muted">$</span>
      <Input
        aria-label="Hourly cost rate in dollars"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="e.g. 95.00"
        className="w-28"
      />
      <span className="text-[13px] text-ink-muted">/ hour</span>
      <Button type="submit" size="sm" variant="secondary" disabled={busy || value === ""}>
        Save
      </Button>
    </form>
  );
}
