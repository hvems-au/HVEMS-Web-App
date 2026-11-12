"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/primitives";
import { setOperatorEquipmentAccessAction } from "./manage-actions";

/** Company code for direct sign-in, and whether operators may use any of the company's equipment. */
export function OperatorAccessCard({ orgId, companyCode, anyEquipment, signInUrl }: { orgId: string; companyCode: string | null; anyEquipment: boolean; signInUrl: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Card className="mb-5">
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[13px] font-medium text-ink-muted">Company code</p>
          <p className="font-mono text-[22px] font-bold tracking-widest text-ink">{companyCode ?? "—"}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            Operators sign in at <span className="font-medium text-ink">{signInUrl}</span> with this code, their Operator ID and PIN. Scanning a QR label doesn&apos;t need it.
          </p>
        </div>
        <label className="flex items-start gap-3 rounded-[10px] border border-stroke p-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--brand)]"
            checked={anyEquipment}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              start(async () => {
                const res = await setOperatorEquipmentAccessAction(orgId, next);
                if (res.status === "error") toast.error(res.message);
                else toast.success(next ? "Operators can use any equipment" : "Operators can use only their ticked equipment");
                router.refresh();
              });
            }}
          />
          <span>
            <span className="block text-[14px] font-semibold text-ink">Operators can use any of the company&apos;s equipment</span>
            <span className="block text-[13px] text-ink-muted">
              {anyEquipment
                ? "Any current vehicle or machine. Untick to limit each operator to the equipment ticked on their profile."
                : "Each operator can use only the equipment ticked on their profile (Equipment button below)."}
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}
