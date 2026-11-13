"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/primitives";
import { confirmDialog } from "@/components/ui/confirm";

type Result = { status: "idle" } | { status: "success"; message?: string } | { status: "error"; message: string };

/**
 * A member's wrong passwords or sign-in lock (O-11), with Unlock for the Owner,
 * Company Admins and the Super Admin. The database checks who may unlock and
 * records it.
 */
export function SignInLock({
  name,
  failedCount,
  lockedUntilText,
  unlock,
}: {
  name: string;
  failedCount: number;
  /** e.g. "3:42 pm"; set while the member is locked out. */
  lockedUntilText: string | null;
  unlock: () => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const label = lockedUntilText ? `Locked until ${lockedUntilText}` : `${failedCount} wrong ${failedCount === 1 ? "password" : "passwords"}`;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <Badge tone={lockedUntilText ? "red" : "amber"}>
        <LockKeyhole className="size-3" aria-hidden />
        {label}
      </Badge>
      <button
        type="button"
        disabled={pending}
        className="text-[12.5px] font-semibold text-link hover:underline disabled:opacity-50"
        onClick={async () => {
          if (!(await confirmDialog({ title: `Unlock sign-in for ${name}?`, description: "Their wrong-password count is cleared and they can sign in straight away.", confirmLabel: "Unlock" }))) return;
          start(async () => {
            const res = await unlock();
            if (res.status === "success") toast.success(res.message ?? "Unlocked");
            else if (res.status === "error") toast.error(res.message);
            router.refresh();
          });
        }}
      >
        {pending ? "Unlocking…" : "Unlock"}
      </button>
    </span>
  );
}
