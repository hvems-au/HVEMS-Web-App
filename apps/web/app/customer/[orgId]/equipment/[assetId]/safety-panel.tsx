"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FileWarning, Hand, Wrench } from "lucide-react";
import { toast } from "sonner";
import { todayISO } from "@hvems/domain";
import type { Breakdown, Hold, RegulatorNotice } from "@hvems/types";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import {
  clearNoticeAction,
  placeHoldAction,
  recordNoticeAction,
  removeHoldAction,
  reportBreakdownAction,
  resolveBreakdownAction,
} from "../../defects/actions";

type Res = { status: "idle" | "success" | "error"; message?: string };

const NOTICE_LABEL = { major: "Major", minor: "Minor", self_clearing: "Self-clearing" } as const;

function useStep() {
  const router = useRouter();
  const [open, setOpenRaw] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const setOpen = (o: boolean) => {
    setOpenRaw(o);
    setError(null);
  };
  const submit = (fn: () => Promise<Res>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === "success") {
        toast.success(res.message ?? "Saved");
        setOpenRaw(false);
        router.refresh();
      } else setError(res.message ?? "Something went wrong");
    });
  return { open, setOpen, error, pending, submit };
}

function Footer({ onCancel, pending, disabled, label, danger }: { onCancel: () => void; pending: boolean; disabled?: boolean; label: string; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending || disabled}>
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

export interface SafetyPanelProps {
  orgId: string;
  assetId: string;
  timezone: string;
  holds: Hold[];
  breakdowns: Breakdown[];
  notices: RegulatorNotice[];
  can: { placeHold: boolean; removeOutOfService: boolean; report: boolean };
  formatWhen: Record<string, string>;
}

/** Holds, breakdowns and regulator defect notices for one piece of equipment. */
export function SafetyPanel(p: SafetyPanelProps) {
  const active = p.holds.length + p.breakdowns.length + p.notices.length;
  return (
    <Card className="mt-5">
      <CardHeader
        title={`Holds, breakdowns and defect notices${active ? ` (${active})` : ""}`}
        description="Each one keeps the equipment flagged until it's cleared"
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {p.can.report ? <BreakdownDialog {...p} /> : null}
            {p.can.placeHold ? <HoldDialog {...p} /> : null}
            {p.can.placeHold ? <NoticeDialog {...p} /> : null}
          </div>
        }
      />
      <CardBody className={active ? "flex flex-col divide-y divide-stroke px-0 pb-0" : undefined}>
        {active === 0 ? <p className="text-[14px] text-ink-muted">Nothing open.</p> : null}
        {p.breakdowns.map((b) => (
          <Row
            key={b.id}
            badge={<Badge tone="red">Breakdown</Badge>}
            title={b.description}
            meta={`${p.formatWhen[b.id] ?? ""}${b.location ? ` · ${b.location}` : ""}`}
            action={p.can.removeOutOfService ? <ResolveBreakdownDialog {...p} breakdown={b} /> : null}
          />
        ))}
        {p.holds.map((h) => (
          <Row
            key={h.id}
            badge={<Badge tone={h.kind === "out_of_service" ? "red" : "amber"}>{h.kind === "out_of_service" ? "Out-of-service hold" : "Needs-attention hold"}</Badge>}
            title={h.reason}
            meta={p.formatWhen[h.id] ?? ""}
            action={(h.kind === "out_of_service" ? p.can.removeOutOfService : p.can.placeHold) ? <RemoveHoldDialog {...p} hold={h} /> : null}
          />
        ))}
        {p.notices.map((n) => (
          <Row
            key={n.id}
            badge={<Badge tone={n.severity === "major" ? "red" : "amber"}>{NOTICE_LABEL[n.severity]} defect notice</Badge>}
            title={`${n.authority}${n.notice_number ? ` ${n.notice_number}` : ""}: ${n.details}`}
            meta={`Issued ${p.formatWhen[n.id] ?? ""}${n.clear_by ? ` · clear by ${p.formatWhen[`${n.id}:clear`] ?? ""}` : ""}`}
            action={(n.severity === "major" ? p.can.removeOutOfService : p.can.placeHold) ? <ClearNoticeDialog {...p} notice={n} /> : null}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function Row({ badge, title, meta, action }: { badge: React.ReactNode; title: string; meta: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3 text-[14px] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          <span className="font-medium text-ink">{title}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-subtle">{meta}</p>
      </div>
      {action}
    </div>
  );
}

function HoldDialog({ orgId, assetId }: SafetyPanelProps) {
  const s = useStep();
  const [kind, setKind] = React.useState("out_of_service");
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Hand /> Place hold
        </Button>
      </DialogTrigger>
      <DialogContent title="Place a hold" description="Stop or flag the equipment for a reason that isn't a defect, e.g. a recall, an incident review or an overdue inspection.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => placeHoldAction(orgId, assetId, { kind, reason }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="Hold" htmlFor="h-kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="out_of_service">Out of service: do not operate</option>
              <option value="needs_attention">Needs attention: can operate with care</option>
            </Select>
          </Field>
          <Field label="Reason" htmlFor="h-reason" required>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Manufacturer brake recall: check before use" />
          </Field>
          {kind === "out_of_service" ? <FormAlert tone="info">The Owner and Fleet Managers get a critical alert.</FormAlert> : null}
          <Footer onCancel={() => s.setOpen(false)} pending={s.pending} disabled={reason.trim().length < 3} label="Place hold" danger={kind === "out_of_service"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveHoldDialog({ orgId, assetId, hold }: SafetyPanelProps & { hold: Hold }) {
  const s = useStep();
  const [note, setNote] = React.useState("");
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Remove hold
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Remove hold"
        description={hold.kind === "out_of_service" ? "Step 1 of 2. The equipment then waits for Return to service." : "The equipment stops showing Needs attention for this hold."}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => removeHoldAction(orgId, assetId, { holdId: hold.id, note }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="Why can it be removed?" htmlFor="rh-note" required>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Recall work completed by the dealer, invoice 5521" />
          </Field>
          <Footer onCancel={() => s.setOpen(false)} pending={s.pending} disabled={note.trim().length < 3} label="Remove hold" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BreakdownDialog({ orgId, assetId }: SafetyPanelProps) {
  const s = useStep();
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [folder] = React.useState(() => `breakdown-${crypto.randomUUID()}`);
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger" size="sm">
          <Wrench /> Report breakdown
        </Button>
      </DialogTrigger>
      <DialogContent title="Report a breakdown" description="The equipment goes Out of service and the Owner and Fleet Managers are alerted straight away.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => reportBreakdownAction(orgId, assetId, { description, location, evidence }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <FormAlert tone="info">If anyone is injured or in danger, call 000 first.</FormAlert>
          <Field label="What happened?" htmlFor="b-desc" required>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Engine overheated and shut down; coolant leaking" />
          </Field>
          <Field label="Where is it?" htmlFor="b-loc">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bruce Hwy northbound near Caboolture" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-ink">Photos (recommended)</span>
            <PhotoPicker orgId={orgId} assetId={assetId} folder={folder} onChange={setEvidence} onBusyChange={setBusy} />
          </div>
          <Footer onCancel={() => s.setOpen(false)} pending={s.pending} disabled={busy || description.trim().length < 3} label="Report breakdown" danger />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveBreakdownDialog({ orgId, assetId, breakdown }: SafetyPanelProps & { breakdown: Breakdown }) {
  const s = useStep();
  const [resolution, setResolution] = React.useState("");
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Mark fixed
        </Button>
      </DialogTrigger>
      <DialogContent title="Breakdown fixed" description="Step 1 of 2. The equipment then waits for Return to service.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => resolveBreakdownAction(orgId, assetId, { breakdownId: breakdown.id, resolution, evidence }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="What was done?" htmlFor="rb-res" required>
            <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Radiator hose replaced by roadside mechanic; coolant topped up" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-ink">Photos (optional)</span>
            <PhotoPicker orgId={orgId} assetId={assetId} folder={`breakdown-${breakdown.id}`} onChange={setEvidence} onBusyChange={setBusy} />
          </div>
          <Footer onCancel={() => s.setOpen(false)} pending={s.pending} disabled={busy || resolution.trim().length < 3} label="Mark fixed" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoticeDialog({ orgId, assetId, timezone }: SafetyPanelProps) {
  const s = useStep();
  const [authority, setAuthority] = React.useState("NHVR");
  const [severity, setSeverity] = React.useState("major");
  const [issuedOn, setIssuedOn] = React.useState(() => todayISO(timezone));
  const [clearBy, setClearBy] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [folder] = React.useState(() => `notice-${crypto.randomUUID()}`);
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <FileWarning /> Defect notice
        </Button>
      </DialogTrigger>
      <DialogContent title="Record a defect notice" description="A notice issued by a regulator or the police, e.g. NHVR, TMR or Queensland Police." className="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => recordNoticeAction(orgId, assetId, { authority, severity, issuedOn, clearBy, noticeNumber: number, details, evidence }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Issued by" htmlFor="n-auth" required>
              <Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="e.g. NHVR, TMR, QPS" />
            </Field>
            <Field label="Notice number" htmlFor="n-num">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
            </Field>
            <Field
              label="Type"
              htmlFor="n-sev"
              hint={severity === "major" ? "Must not be used until cleared: the equipment goes Out of service." : "Can be used; must be fixed and cleared by the date given: Needs attention."}
            >
              <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="major">Major defect notice</option>
                <option value="minor">Minor defect notice</option>
                <option value="self_clearing">Self-clearing defect notice</option>
              </Select>
            </Field>
            <Field label="Date issued" htmlFor="n-issued" required>
              <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </Field>
            <Field label="Clear by" htmlFor="n-clear">
              <Input type="date" value={clearBy} onChange={(e) => setClearBy(e.target.value)} />
            </Field>
          </div>
          <Field label="Defects listed on the notice" htmlFor="n-details" required>
            <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Rear left brake light inoperative; worn tyre axle 3" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-ink">Photo of the notice (recommended)</span>
            <PhotoPicker orgId={orgId} assetId={assetId} folder={folder} onChange={setEvidence} onBusyChange={setBusy} />
          </div>
          <Footer
            onCancel={() => s.setOpen(false)}
            pending={s.pending}
            disabled={busy || authority.trim().length < 2 || details.trim().length < 3 || !issuedOn}
            label="Record notice"
            danger={severity === "major"}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClearNoticeDialog({ orgId, assetId, timezone, notice }: SafetyPanelProps & { notice: RegulatorNotice }) {
  const s = useStep();
  const [clearedOn, setClearedOn] = React.useState(() => todayISO(timezone));
  const [reference, setReference] = React.useState("");
  const [evidence, setEvidence] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={s.open} onOpenChange={s.setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Clear notice
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Clear the defect notice"
        description={notice.severity === "major" ? "Step 1 of 2. The equipment then waits for Return to service." : "The equipment stops showing Needs attention for this notice."}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.submit(() => clearNoticeAction(orgId, assetId, { noticeId: notice.id, clearedOn, reference, evidence }));
          }}
        >
          {s.error ? <FormAlert>{s.error}</FormAlert> : null}
          <Field label="Date cleared" htmlFor="cn-date" required>
            <Input type="date" value={clearedOn} onChange={(e) => setClearedOn(e.target.value)} />
          </Field>
          <Field label="Clearance reference" htmlFor="cn-ref" required hint="e.g. the inspection station and certificate or clearance number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TMR Logan, clearance 448812" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-ink">Photo of the clearance (recommended)</span>
            <PhotoPicker orgId={orgId} assetId={assetId} folder={`notice-${notice.id}`} onChange={setEvidence} onBusyChange={setBusy} />
          </div>
          <Footer onCancel={() => s.setOpen(false)} pending={s.pending} disabled={busy || reference.trim().length < 3 || !clearedOn} label="Clear notice" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
