"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { agreeFleetSubscriptionAction } from "./consent-actions";

/** SoW 5.2: the Owner or Finance agrees to the fleet price before the sixth asset is saved. */
export function FleetConsentButton({ orgId, perAssetCents, freeAssets, priceText }: { orgId: string; perAssetCents: number; freeAssets: number; priceText: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await agreeFleetSubscriptionAction(orgId, perAssetCents, freeAssets);
    setBusy(false);
    if (res.status === "success") {
      toast.success(res.message);
      router.refresh();
    } else if (res.status === "error") setError(res.message);
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-[14px]">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-4 accent-brand" />
        <span>
          I agree to the fleet subscription: {priceText} per asset per month above the first {freeAssets}, charged monthly in arrears to the
          default card, based on the most assets held at any time in the month. The first month above {freeAssets} assets is free.
        </span>
      </label>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button className="self-start" disabled={!agreed || busy} onClick={submit}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Agree to the fleet subscription
      </Button>
    </div>
  );
}
