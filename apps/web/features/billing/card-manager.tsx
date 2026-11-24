"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { CreditCard, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { FormAlert } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { finishCardSetupAction, makeDefaultCardAction, removeCardAction, startCardSetupAction } from "./actions";

export interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

let stripePromise: Promise<StripeJs | null> | null = null;
const stripeFor = (key: string) => (stripePromise ??= loadStripe(key, { locale: "en-AU" }));

const brandName = (b: string | null) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : "Card");

export function CardManager({ orgId, cards, publishableKey, canManage }: { orgId: string; cards: SavedCard[]; publishableKey: string | null; canManage: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const start = async () => {
    setBusy("start");
    setError(null);
    const res = await startCardSetupAction(orgId);
    setBusy(null);
    if (res.status === "success" && res.data) setSecret(res.data.clientSecret);
    else if (res.status === "error") setError(res.message);
  };

  const act = async (id: string, kind: "default" | "remove") => {
    if (kind === "remove") {
      const ok = await confirmDialog({
        title: "Remove this card?",
        description: "HVEMS won't charge it again. Add another card first if you have a subscription.",
        confirmLabel: "Remove card",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(id);
    setError(null);
    const res = kind === "default" ? await makeDefaultCardAction(orgId, id) : await removeCardAction(orgId, id);
    setBusy(null);
    if (res.status === "success") {
      toast.success(res.message);
      router.refresh();
    } else if (res.status === "error") setError(res.message);
  };

  return (
    <div className="flex flex-col gap-3">
      {cards.length ? (
        <ul className="flex flex-col divide-y divide-stroke rounded-[10px] border border-stroke">
          {cards.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
              <CreditCard className="size-5 text-ink-muted" aria-hidden />
              <span className="font-medium text-ink">
                {brandName(c.brand)} ending {c.last4 ?? "????"}
              </span>
              {c.exp_month && c.exp_year ? (
                <span className="text-ink-subtle">
                  Expires {String(c.exp_month).padStart(2, "0")}/{c.exp_year}
                </span>
              ) : null}
              {c.is_default ? <Badge tone="green">Default</Badge> : null}
              {canManage ? (
                <span className="ml-auto flex gap-2">
                  {!c.is_default ? (
                    <Button variant="secondary" size="sm" disabled={!!busy || !publishableKey} onClick={() => act(c.id, "default")}>
                      {busy === c.id ? <Loader2 className="animate-spin" aria-hidden /> : <Star aria-hidden />} Make default
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" disabled={!!busy || !publishableKey} onClick={() => act(c.id, "remove")} aria-label={`Remove ${brandName(c.brand)} ending ${c.last4}`}>
                    <Trash2 aria-hidden /> Remove
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-subtle">No card saved yet.</p>
      )}

      {error ? <FormAlert>{error}</FormAlert> : null}

      {canManage && publishableKey ? (
        secret ? (
          <Elements stripe={stripeFor(publishableKey)} options={{ clientSecret: secret, appearance: { theme: "stripe", variables: { colorPrimary: "#CE5502" } } }}>
            <AddCardForm
              orgId={orgId}
              onDone={() => {
                setSecret(null);
                router.refresh();
              }}
              onCancel={() => setSecret(null)}
            />
          </Elements>
        ) : (
          <Button variant="secondary" className="self-start" onClick={start} disabled={busy === "start"}>
            {busy === "start" ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add a card
          </Button>
        )
      ) : null}
    </div>
  );
}

function AddCardForm({ orgId, onDone, onCancel }: { orgId: string; onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (confirmError || !setupIntent) {
      setBusy(false);
      setError(confirmError?.message ?? "The card couldn't be saved. Try again.");
      return;
    }
    const res = await finishCardSetupAction(orgId, setupIntent.id);
    setBusy(false);
    if (res.status === "success") {
      toast.success(res.message);
      onDone();
    } else if (res.status === "error") setError(res.message);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[10px] border border-stroke p-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !stripe}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Save card
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      <p className="text-[12px] text-ink-subtle">Card details go straight to Stripe; HVEMS never sees or stores the card number.</p>
    </form>
  );
}
