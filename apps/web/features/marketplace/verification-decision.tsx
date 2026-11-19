"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Ban, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/confirm";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { decideVerificationAction, setProviderSuspendedAction } from "./actions";
import { dmy } from "./labels";

type Doc = { id: string; kind: string; title: string; expiresOn: string | null; url: string | null };

/**
 * The Verification Officer's decision (MKT-02, O-01): confirm the ABN by hand on the ABR website,
 * choose the insurance certificate checked, tick qualifications checked, approve; or reject with a reason.
 */
export function VerificationDecision({ orgId, abn, businessName, docs, today, canDecide }: { orgId: string; abn: string | null; businessName: string; docs: Doc[]; today: string; canDecide: boolean }) {
  const router = useRouter();
  const insurance = docs.filter((d) => d.kind === "public_liability" && d.expiresOn && d.expiresOn >= today);
  const quals = docs.filter((d) => d.kind === "qualification" || d.kind === "licence");
  const [abnActive, setAbnActive] = React.useState(false);
  const [abnName, setAbnName] = React.useState(false);
  const [ins, setIns] = React.useState(insurance[0]?.id ?? "");
  const [cover, setCover] = React.useState("");
  const [checked, setChecked] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const decide = async (approve: boolean) => {
    setError(null);
    setBusy(true);
    const res = await decideVerificationAction({
      orgId,
      approve,
      reason,
      abnActive,
      abnNameMatches: abnName,
      insuranceDocumentId: ins,
      insuranceCoverDollars: cover,
      qualificationDocumentIds: checked,
    });
    setBusy(false);
    if (res.status === "error") return setError(res.message);
    toast.success(approve ? "Provider verified" : "Verification rejected");
    router.refresh();
  };

  if (!canDecide) return <p className="text-[14px] text-ink-muted">Only a Verification Officer can decide.</p>;
  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="rounded-[10px] border border-stroke p-3.5">
        <p className="mb-2 text-[14px] font-medium">1. ABN</p>
        {abn ? (
          <a href={`https://abr.business.gov.au/ABN/View?abn=${abn}`} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-[13.5px] text-link hover:underline">
            Look up {abn} on the Australian Business Register <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={abnActive} onChange={(e) => setAbnActive(e.target.checked)} className="size-4 accent-[var(--brand)]" /> The ABN is active
        </label>
        <label className="mt-1 flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={abnName} onChange={(e) => setAbnName(e.target.checked)} className="size-4 accent-[var(--brand)]" /> It matches {businessName}
        </label>
      </div>
      <div className="rounded-[10px] border border-stroke p-3.5">
        <p className="mb-2 text-[14px] font-medium">2. Public liability insurance</p>
        {insurance.length === 0 ? (
          <p className="text-[13.5px] text-danger-ink">No current certificate uploaded. Reject and ask for one.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Certificate checked" htmlFor="vd-ins">
              <Select id="vd-ins" value={ins} onChange={(e) => setIns(e.target.value)}>
                {insurance.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} (expires {dmy(d.expiresOn)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cover amount ($)" htmlFor="vd-cover" hint="As stated on the certificate">
              <Input id="vd-cover" inputMode="numeric" value={cover} onChange={(e) => setCover(e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 20000000" />
            </Field>
          </div>
        )}
      </div>
      {quals.length ? (
        <div className="rounded-[10px] border border-stroke p-3.5">
          <p className="mb-2 text-[14px] font-medium">3. Qualifications and licences checked</p>
          {quals.map((d) => (
            <label key={d.id} className="flex items-center gap-2 py-0.5 text-[14px]">
              <input
                type="checkbox"
                checked={checked.includes(d.id)}
                onChange={(e) => setChecked((c) => (e.target.checked ? [...c, d.id] : c.filter((x) => x !== d.id)))}
                className="size-4 accent-[var(--brand)]"
              />
              {d.title}
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="text-[13px] text-link hover:underline">
                  open
                </a>
              ) : null}
            </label>
          ))}
        </div>
      ) : null}
      <Field label="Note or reason" htmlFor="vd-reason" hint="Required to reject; shown to the provider">
        <Textarea id="vd-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => decide(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Approve and issue badges
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => decide(false)}>
          <XCircle /> Reject
        </Button>
      </div>
    </div>
  );
}

export function SuspendButton({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant={suspended ? "secondary" : "ghost"}
      onClick={async () => {
        const reason = await promptDialog({
          title: suspended ? "Reinstate this provider?" : "Suspend this provider?",
          description: suspended ? "It can propose again if its badges are current." : "It can't submit proposals while suspended. The reason is shown to the provider.",
          input: { label: "Reason", required: true },
          confirmLabel: suspended ? "Reinstate" : "Suspend",
          danger: !suspended,
        });
        if (!reason) return;
        const res = await setProviderSuspendedAction(orgId, !suspended, reason);
        if (res.status === "error") toast.error(res.message);
        else toast.success(suspended ? "Reinstated" : "Suspended");
        router.refresh();
      }}
    >
      <Ban /> {suspended ? "Reinstate" : "Suspend"}
    </Button>
  );
}
