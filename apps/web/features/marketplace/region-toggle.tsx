"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm";
import { setRegionAction } from "./actions";

export function RegionToggle({ code, name, open, disabled }: { code: string; name: string; open: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <label className="inline-flex items-center gap-2 text-[14px]">
      <input
        type="checkbox"
        checked={open}
        disabled={disabled || busy}
        onChange={async () => {
          if (
            !(await confirmDialog({
              title: open ? `Close ${name}?` : `Open ${name}?`,
              description: open ? "New jobs can't be posted there. Open jobs carry on." : "Posters there can post jobs straight away.",
              confirmLabel: open ? "Close" : "Open",
            }))
          )
            return;
          setBusy(true);
          const res = await setRegionAction(code, name, !open);
          setBusy(false);
          if (res.status === "error") toast.error(res.message);
          router.refresh();
        }}
        className="size-4 accent-[var(--brand)]"
      />
      {open ? "Open" : "Not open"}
    </label>
  );
}
