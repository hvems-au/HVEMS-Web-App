"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Flag, Loader2, MapPin, Navigation, ShieldCheck, Star, Upload, XCircle } from "lucide-react";
import type { EngagementFinding, EngagementReview, EngagementVariation, MarketplaceCase } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { confirmDialog, promptDialog } from "@/components/ui/confirm";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  attendanceAction,
  assignTechnicianAction,
  cancelEngagementAction,
  confirmCompletionAction,
  decideFindingAction,
  decideVariationAction,
  proposeVariationAction,
  raiseCaseAction,
  recordFindingAction,
  replyReviewAction,
  reportNoShowAction,
  reportPaymentAction,
  respondCaseAction,
  reviewAction,
  submitCompletionAction,
} from "./engagement-actions";
import { ENGAGEMENT_STATUS, aud } from "./labels";


const CASE_CATEGORY: Record<string, string> = { no_show: "No-show", conduct: "Conduct", safety: "Safety concern", fee: "Fee", strike_review: "Strike review", other: "Other" };
const CASE_STATUS: Record<string, string> = { awaiting_response: "Waiting for a response", under_review: "With HVEMS", decided: "Decided", closed: "Closed" };
const LIVE = ["confirmed", "on_my_way", "on_site", "completed", "correction_requested", "no_show_reported"];

export type PanelData = {
  engagementId: string;
  jobId: string;
  side: "poster" | "provider";
  status: string;
  urgent: boolean;
  feeCents: number;
  feeStatus: string;
  providerId: string;
  canManage: boolean;
  safetyAcknowledged: boolean;
  scheduledStart: string | null;
  onMyWayAt: string | null;
  eta: string | null;
  onSite: string | null;
  technicianId: string | null;
  team: { value: string; label: string }[];
  completion: { outcome: string | null; notes: string | null; parts: string | null; remaining: string | null; recommendations: string | null; at: string | null; files: { name: string; url: string | null }[] };
  correctionReason: string | null;
  payment: { by: string | null; at: string | null; note: string | null };
  findings: EngagementFinding[];
  variations: (EngagementVariation & { when: string })[];
  cases: (MarketplaceCase & { when: string; respondBy: string | null })[];
  review: EngagementReview | null;
  canReview: boolean;
  cancel: { at: string | null; by: string | null; reason: string | null };
  otherName: string;
};

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const go = async (p: Promise<{ status: string; message?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (res.status === "error") toast.error(res.message ?? "Something went wrong");
    else toast.success(res.message ?? "Done");
    router.refresh();
    return res.status !== "error";
  };
  return { busy, go };
}

/** Everything that happens on a confirmed engagement (MKT-11..19), for whichever side is looking. */
export function EngagementPanel({ d }: { d: PanelData }) {
  const { busy, go } = useRun();
  const live = LIVE.includes(d.status);
  const provider = d.side === "provider";
  const poster = d.side === "poster";
  const st = ENGAGEMENT_STATUS[d.status] ?? { label: d.status, tone: "grey" as const };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Status" action={<Badge tone={st.tone}>{st.label}</Badge>} />
        <CardBody className="flex flex-col gap-3 pt-0 text-[14px]">
          <p className="text-ink-muted">
            Connection fee {aud(d.feeCents)} each.{" "}
            {d.feeStatus === "waived_follow_up" ? "No fee: follow-up within 30 days." : d.feeStatus === "not_live" ? "Fee payments aren't switched on yet, so nothing was charged." : null}
          </p>
          {d.cancel.at ? (
            <p className="text-danger-ink">
              Cancelled by {d.cancel.by === "hvems" ? "HVEMS" : d.cancel.by === "provider" ? "the provider" : "the customer"}: {d.cancel.reason}
            </p>
          ) : null}

          {/* Provider: attendance (MKT-12) */}
          {provider && live && ["confirmed", "on_my_way", "on_site", "no_show_reported"].includes(d.status) ? (
            <div className="flex flex-col gap-3 rounded-[10px] border border-stroke p-3.5">
              {d.canManage ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Technician" htmlFor="eng-tech" className="min-w-[220px]">
                    <Select id="eng-tech" defaultValue={d.technicianId ?? ""} onChange={(e) => go(assignTechnicianAction(d.engagementId, e.target.value))}>
                      <option value="">Not assigned</option>
                      {d.team.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {!d.urgent ? <ScheduleInput engagementId={d.engagementId} current={d.scheduledStart} /> : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {!d.safetyAcknowledged ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirmDialog({ title: "Acknowledge the site safety information?", description: "Confirm you have read the site access and safety instructions above.", confirmLabel: "I've read it" }))
                        await go(attendanceAction(d.engagementId, "acknowledge_safety"));
                    }}
                  >
                    <ShieldCheck /> Acknowledge site safety
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ok-ink">
                    <ShieldCheck className="size-4" /> Site safety acknowledged
                  </span>
                )}
                {!d.onSite ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      const m = await promptDialog({ title: d.onMyWayAt ? "Update your arrival time" : "On my way", input: { label: "Arriving in (minutes)", required: true }, confirmLabel: "Send" });
                      const n = Number(m);
                      if (m && Number.isFinite(n) && n > 0) await go(attendanceAction(d.engagementId, d.onMyWayAt ? "update_eta" : "on_my_way", Math.round(n)));
                    }}
                  >
                    <Navigation /> {d.onMyWayAt ? "Update arrival time" : "On my way"}
                  </Button>
                ) : null}
                {!d.onSite ? (
                  <Button disabled={busy || !d.safetyAcknowledged} onClick={() => go(attendanceAction(d.engagementId, "on_site"))}>
                    <MapPin /> On site
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ok-ink">
                    <MapPin className="size-4" /> On site since {d.onSite}
                  </span>
                )}
              </div>
            </div>
          ) : null}
          {poster && (d.onMyWayAt || d.onSite || d.scheduledStart) ? (
            <p className="text-ink-muted">
              {d.onSite ? `On site since ${d.onSite}.` : d.eta ? `On the way, arriving about ${d.eta}.` : d.scheduledStart ? `Booked to start ${d.scheduledStart}.` : null}
            </p>
          ) : null}

          {/* Poster: no-show and confirmation */}
          {poster && ["confirmed", "on_my_way"].includes(d.status) && !d.onSite ? (
            <div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  const note = await promptDialog({
                    title: "Report a no-show?",
                    description: d.urgent ? "Allowed 60 minutes after the committed arrival time." : "Allowed 2 hours after the agreed start. The provider has 48 hours to respond before HVEMS decides.",
                    input: { label: "What happened", required: true },
                    confirmLabel: "Report no-show",
                    danger: true,
                  });
                  if (note) await go(reportNoShowAction(d.engagementId, note));
                }}
              >
                <Flag /> Report a no-show
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Completion d={d} />
      <Findings d={d} />
      <Variations d={d} />
      <Cases d={d} />
      <ReviewCard d={d} />

      <Card>
        <CardHeader title="Payment for the work" description="Paid directly between you; HVEMS doesn't handle job payments" />
        <CardBody className="flex flex-wrap items-center gap-3 pt-0 text-[14px]">
          {d.payment.by ? (
            <p>
              Payment reported by {d.payment.by === "poster" ? "the customer" : "the provider"} on {d.payment.at}
              {d.payment.note ? `: ${d.payment.note}` : ""}. <span className="text-ink-subtle">(Reported, not verified by HVEMS.)</span>
            </p>
          ) : (
            <p className="text-ink-muted">Not reported yet.</p>
          )}
          {d.status !== "cancelled" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                const note = await promptDialog({ title: "Mark the job payment as reported", input: { label: "Note (e.g. invoice number, amount)" }, confirmLabel: "Mark reported" });
                if (note !== null) await go(reportPaymentAction(d.engagementId, note));
              }}
            >
              Mark payment reported
            </Button>
          ) : null}
        </CardBody>
      </Card>

      {live && ["confirmed", "on_my_way", "on_site", "no_show_reported"].includes(d.status) && (poster || d.canManage) ? (
        <div>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              const reason = await promptDialog({
                title: "Cancel this engagement?",
                description: provider
                  ? "A cancellation by the provider counts as a strike, and the job reopens for the customer."
                  : "The provider is told. Connection fee refunds follow the rules in Section 5.7 once fees are live.",
                input: { label: "Reason", required: true },
                confirmLabel: "Cancel engagement",
                danger: true,
              });
              if (reason) await go(cancelEngagementAction(d.engagementId, provider ? "cannot_attend" : "no_longer_needed", reason));
            }}
          >
            <XCircle /> Cancel engagement
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleInput({ engagementId, current }: { engagementId: string; current: string | null }) {
  const { busy, go } = useRun();
  const [v, setV] = React.useState("");
  return (
    <div className="flex items-end gap-2">
      <Field label={current ? `Start time (now ${current})` : "Start time"} htmlFor="eng-start">
        <Input id="eng-start" type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      <Button size="sm" variant="secondary" disabled={busy || !v} onClick={() => go(attendanceAction(engagementId, "schedule", undefined, v))}>
        Save
      </Button>
    </div>
  );
}

function Completion({ d }: { d: PanelData }) {
  const { busy, go } = useRun();
  const [f, setF] = React.useState({ outcome: "complete" as "complete" | "partial", notes: "", parts: "", remaining: "", recommendations: "" });
  const [paths, setPaths] = React.useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const canSubmit = d.side === "provider" && ["confirmed", "on_my_way", "on_site", "correction_requested"].includes(d.status);

  return (
    <Card>
      <CardHeader title="Completion report" />
      <CardBody className="flex flex-col gap-3 pt-0 text-[14px]">
        {d.completion.at ? (
          <div className="rounded-[10px] border border-stroke p-3.5">
            <p className="font-medium">
              {d.completion.outcome === "partial" ? "Partly complete" : "Complete"} · {d.completion.at}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{d.completion.notes}</p>
            {d.completion.parts ? <p className="mt-1 text-ink-muted">Parts: {d.completion.parts}</p> : null}
            {d.completion.remaining ? <p className="mt-1 text-ink-muted">Remaining issues: {d.completion.remaining}</p> : null}
            {d.completion.recommendations ? <p className="mt-1 text-ink-muted">Recommendations: {d.completion.recommendations}</p> : null}
            {d.completion.files.length ? (
              <p className="mt-1">
                {d.completion.files.map((x) =>
                  x.url ? (
                    <a key={x.name} href={x.url} target="_blank" rel="noreferrer" className="mr-3 text-link hover:underline">
                      {x.name}
                    </a>
                  ) : (
                    <span key={x.name} className="mr-3">
                      {x.name}
                    </span>
                  ),
                )}
              </p>
            ) : null}
          </div>
        ) : !canSubmit ? (
          <p className="text-ink-muted">The provider hasn&apos;t sent a completion report yet.</p>
        ) : null}
        {d.correctionReason && d.status === "correction_requested" ? <p className="text-warn-ink">Correction requested: {d.correctionReason}</p> : null}
        {d.side === "poster" && d.status === "completed" ? (
          <div className="flex flex-col gap-2">
            <p className="text-ink-muted">Confirming doesn&apos;t clear defects or return equipment to service: do that separately under Defects &amp; Safety.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => go(confirmCompletionAction(d.engagementId, true))}>
                <CheckCircle2 /> Confirm completion
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  const r = await promptDialog({ title: "Ask for a correction", input: { label: "What needs correcting", required: true }, confirmLabel: "Send" });
                  if (r) await go(confirmCompletionAction(d.engagementId, false, r));
                }}
              >
                Ask for a correction
              </Button>
            </div>
          </div>
        ) : null}
        {canSubmit ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (f.notes.trim().length < 3) return setError("Describe the work done.");
              await go(submitCompletionAction(d.engagementId, { ...f, paths: paths.map((p) => p.path) }));
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Outcome" htmlFor="cr-outcome">
                <Select id="cr-outcome" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value as "complete" | "partial" })}>
                  <option value="complete">Complete</option>
                  <option value="partial">Partly complete</option>
                </Select>
              </Field>
              <Field label="Photos or invoice" htmlFor="cr-files" hint={paths.length ? `${paths.length} attached` : "PDF or photos"}>
                <Input
                  id="cr-files"
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  disabled={uploading}
                  className="h-auto py-2"
                  onChange={async (e) => {
                    const list = Array.from(e.target.files ?? []).slice(0, 12 - paths.length);
                    setUploading(true);
                    for (const file of list) {
                      const path = `${d.providerId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
                      const up = await getSupabaseBrowserClient().storage.from("marketplace-files").upload(path, file, { contentType: file.type || undefined, upsert: false });
                      if (up.error) toast.error(`${file.name} didn't upload`);
                      else setPaths((cur) => [...cur, { path, name: file.name }]);
                    }
                    setUploading(false);
                  }}
                />
              </Field>
            </div>
            <Field label="Work done" htmlFor="cr-notes" required>
              <Textarea id="cr-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={4000} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Parts used" htmlFor="cr-parts">
                <Textarea id="cr-parts" rows={2} value={f.parts} onChange={(e) => setF({ ...f, parts: e.target.value })} maxLength={2000} />
              </Field>
              <Field label="Remaining issues" htmlFor="cr-rem">
                <Textarea id="cr-rem" rows={2} value={f.remaining} onChange={(e) => setF({ ...f, remaining: e.target.value })} maxLength={2000} />
              </Field>
              <Field label="Recommendations" htmlFor="cr-rec">
                <Textarea id="cr-rec" rows={2} value={f.recommendations} onChange={(e) => setF({ ...f, recommendations: e.target.value })} maxLength={2000} />
              </Field>
            </div>
            <Button type="submit" disabled={busy || uploading} className="self-start">
              {busy || uploading ? <Loader2 className="animate-spin" /> : <Upload />} Send completion report
            </Button>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Findings({ d }: { d: PanelData }) {
  const { busy, go } = useRun();
  const [sev, setSev] = React.useState<"critical" | "minor" | "advisory">("minor");
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const canRecord = d.side === "provider" && LIVE.includes(d.status) && d.status !== "completed";
  if (!d.findings.length && !canRecord) return null;
  return (
    <Card>
      <CardHeader title="Findings" description={d.side === "poster" ? "Issues the provider found. Critical ones take the equipment out of service at once." : "Issues you found on the equipment"} />
      <CardBody className="flex flex-col gap-3 pt-0 text-[14px]">
        {d.findings.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-stroke p-3">
            <span>
              <Badge tone={f.severity === "critical" ? "red" : f.severity === "minor" ? "amber" : "grey"} className="mr-2">
                {f.severity === "critical" ? "Critical" : f.severity === "minor" ? "Minor" : "Advisory"}
              </Badge>
              <span className="font-medium">{f.title}</span>
              {f.description ? <span className="block text-ink-muted">{f.description}</span> : null}
            </span>
            {d.side === "poster" && f.status === "suggested" ? (
              <span className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => go(decideFindingAction(f.id, true))}>
                  Add to Defects
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => go(decideFindingAction(f.id, false))}>
                  Dismiss
                </Button>
              </span>
            ) : (
              <span className="text-[12.5px] text-ink-subtle">
                {{ suggested: "Waiting for the customer", confirmed: "Added to Defects", dismissed: "Dismissed", recorded: "Recorded" }[f.status]}
              </span>
            )}
          </div>
        ))}
        {canRecord ? (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (title.trim().length < 3) return toast.error("Say what you found");
              if (sev === "critical" && !(await confirmDialog({ title: "Record a Critical finding?", description: "The customer's equipment is taken out of service at once, awaiting their review.", confirmLabel: "Record", danger: true })))
                return;
              if (await go(recordFindingAction(d.engagementId, sev, title, desc))) {
                setTitle("");
                setDesc("");
              }
            }}
          >
            <Field label="Severity" htmlFor="fd-sev">
              <Select id="fd-sev" value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}>
                <option value="critical">Critical: unsafe to use</option>
                <option value="minor">Minor: needs repair</option>
                <option value="advisory">Advisory</option>
              </Select>
            </Field>
            <Field label="What you found" htmlFor="fd-title">
              <Input id="fd-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Details" htmlFor="fd-desc" className="sm:col-span-2">
              <Textarea id="fd-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={4000} />
            </Field>
            <Button type="submit" variant="secondary" disabled={busy} className="self-start">
              <AlertTriangle /> Record finding
            </Button>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Variations({ d }: { d: PanelData }) {
  const { busy, go } = useRun();
  const can = LIVE.includes(d.status) && (d.side === "poster" || d.canManage);
  return (
    <Card>
      <CardHeader title="Changes" description="Price, scope or timing changes need the other party's agreement. They don't change connection fees." />
      <CardBody className="flex flex-col gap-2 pt-0 text-[14px]">
        {d.variations.length === 0 ? <p className="text-ink-muted">No changes.</p> : null}
        {d.variations.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-stroke p-3">
            <span>
              <span className="font-medium">{{ price: "Price", scope: "Scope", timing: "Timing" }[v.kind]}</span>: {v.description}
              {v.new_amount_cents !== null ? ` · new price ${aud(v.new_amount_cents)}` : ""}
              {v.new_date ? ` · new date ${v.new_date.split("-").reverse().join("/")}` : ""}
              <span className="block text-[12.5px] text-ink-subtle">
                Proposed by {v.proposed_by_side === "poster" ? "the customer" : "the provider"}, {v.when}
              </span>
            </span>
            {v.status === "pending" && v.proposed_by_side !== d.side && can ? (
              <span className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => go(decideVariationAction(v.id, true))}>
                  Accept
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => go(decideVariationAction(v.id, false))}>
                  Decline
                </Button>
              </span>
            ) : (
              <Badge tone={v.status === "accepted" ? "green" : v.status === "pending" ? "amber" : "grey"}>{{ pending: "Waiting", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" }[v.status]}</Badge>
            )}
          </div>
        ))}
        {can ? (
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                const desc = await promptDialog({ title: "Propose a change", description: "Describe the change. Add a new price as $ at the start, e.g. \"$2,100 seal kit also needed\".", input: { label: "Change", required: true }, confirmLabel: "Propose" });
                if (!desc) return;
                const m = desc.match(/^\s*\$\s*([\d,]+(?:\.\d{1,2})?)/);
                await go(proposeVariationAction(d.engagementId, m ? "price" : "scope", desc, m?.[1] ? m[1].replace(/,/g, "") : undefined));
              }}
            >
              Propose a change
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Cases({ d }: { d: PanelData }) {
  const { busy, go } = useRun();
  return (
    <Card>
      <CardHeader title="Cases" description="For no-shows, conduct, safety or fees. HVEMS decides these; work quality and job payments are between you." />
      <CardBody className="flex flex-col gap-2 pt-0 text-[14px]">
        {d.cases.length === 0 ? <p className="text-ink-muted">None.</p> : null}
        {d.cases.map((c) => (
          <div key={c.id} className="rounded-[10px] border border-stroke p-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                Case {c.number}: {CASE_CATEGORY[c.category]}
              </span>
              <Badge tone={c.status === "decided" ? (c.upheld ? "red" : "green") : "amber"}>{CASE_STATUS[c.status]}</Badge>
            </p>
            <p className="mt-1 text-ink-muted">
              {c.raised_by_side === "poster" ? "Customer" : c.raised_by_side === "provider" ? "Provider" : "HVEMS"}, {c.when}: {c.description}
            </p>
            {c.response ? <p className="mt-1">Response: {c.response}</p> : null}
            {c.outcome ? (
              <p className="mt-1 font-medium">
                HVEMS: {c.upheld ? "upheld" : "not upheld"}. {c.outcome}
              </p>
            ) : null}
            {c.status === "awaiting_response" && c.raised_by_side !== d.side ? (
              <div className="mt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const r = await promptDialog({ title: "Respond to the case", input: { label: "Your response", required: true }, confirmLabel: "Send" });
                    if (r) await go(respondCaseAction(c.id, r));
                  }}
                >
                  Respond
                </Button>
                {c.respondBy ? <span className="text-[12.5px] text-warn-ink">Respond by {c.respondBy}</span> : null}
              </div>
            ) : null}
          </div>
        ))}
        {d.status !== "cancelled" || d.cases.length ? (
          <div>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const desc = await promptDialog({
                  title: "Raise a case with HVEMS",
                  description: "About conduct, a safety concern or a fee. Start with the topic, e.g. \"Safety: no harness used\". The other party has 48 hours to respond.",
                  input: { label: "What happened", required: true },
                  confirmLabel: "Raise case",
                });
                if (!desc) return;
                const lower = desc.toLowerCase();
                const cat = lower.startsWith("safety") ? "safety" : lower.startsWith("fee") ? "fee" : lower.startsWith("conduct") ? "conduct" : "other";
                await go(raiseCaseAction(d.engagementId, cat, desc));
              }}
            >
              <Flag /> Raise a case
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ReviewCard({ d }: { d: PanelData }) {
  const { busy, go } = useRun();
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  if (!d.review && !d.canReview) return null;
  return (
    <Card>
      <CardHeader title="Review" />
      <CardBody className="flex flex-col gap-3 pt-0 text-[14px]">
        {d.review ? (
          <div>
            <p className="flex items-center gap-1" aria-label={`${d.review.rating} out of 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn("size-4", n <= d.review!.rating ? "fill-[var(--brand)] text-brand" : "text-ink-subtle")} aria-hidden />
              ))}
            </p>
            {d.review.comment ? <p className="mt-1">{d.review.comment}</p> : null}
            {d.review.reply ? <p className="mt-2 rounded-[8px] bg-surface-muted p-2.5 text-ink-muted">Provider&apos;s reply: {d.review.reply}</p> : null}
            {d.side === "provider" && !d.review.reply && d.canManage ? (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                disabled={busy}
                onClick={async () => {
                  const r = await promptDialog({ title: "Reply to the review", description: "You can reply once.", input: { label: "Reply", required: true }, confirmLabel: "Post reply" });
                  if (r) await go(replyReviewAction(d.engagementId, r));
                }}
              >
                Reply
              </Button>
            ) : null}
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rating) return toast.error("Choose 1 to 5 stars");
              await go(reviewAction(d.engagementId, rating, comment));
            }}
          >
            <p className="text-ink-muted">How was {d.otherName}? Reviews can be left within 14 days of completion, once.</p>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)}>
                  <Star className={cn("size-6", n <= rating ? "fill-[var(--brand)] text-brand" : "text-ink-subtle")} />
                </button>
              ))}
            </div>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Comment (optional)" aria-label="Comment" />
            <Button type="submit" disabled={busy} className="self-start">
              Post review
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
