"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, CalendarPlus, Loader2, Megaphone, Search, UserPlus, XCircle } from "lucide-react";
import type { ProviderCard } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { confirmDialog, promptDialog } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormAlert, Input, SEARCH_FIELD } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { clarificationAction, extendJobAction, inviteProvidersAction, searchProvidersAction, withdrawJobAction } from "./actions";
import { PROVIDER_CATEGORIES, type ProviderCategory } from "./labels";

/** Poster actions on an open job: extend once, withdraw, one clarification, invite providers. */
export function JobControls({
  orgId,
  jobId,
  canExtend,
  canWithdraw,
  canClarify,
  canInvite,
  category,
}: {
  orgId: string;
  jobId: string;
  canExtend: boolean;
  canWithdraw: boolean;
  canClarify: boolean;
  canInvite: boolean;
  category: string;
}) {
  const router = useRouter();
  const run = async (p: Promise<{ status: string; message?: string }>) => {
    const res = await p;
    if (res.status === "error") toast.error(res.message ?? "Something went wrong");
    else toast.success(res.message ?? "Done");
    router.refresh();
  };
  return (
    <div className="flex flex-wrap gap-2">
      {canInvite ? <InviteDialog orgId={orgId} jobId={jobId} category={category} /> : null}
      {canClarify ? (
        <Button
          variant="secondary"
          onClick={async () => {
            const body = await promptDialog({
              title: "Send a clarification",
              description: "Goes to every provider who asked a question or proposed. You can send one per job.",
              input: { label: "Clarification", required: true },
              confirmLabel: "Send to all",
            });
            if (body) await run(clarificationAction(orgId, jobId, body));
          }}
        >
          <Megaphone /> Clarify to all
        </Button>
      ) : null}
      {canExtend ? (
        <Button
          variant="secondary"
          onClick={async () => {
            if (await confirmDialog({ title: "Extend by 14 days?", description: "A standard job can be extended once.", confirmLabel: "Extend" })) await run(extendJobAction(orgId, jobId));
          }}
        >
          <CalendarPlus /> Extend
        </Button>
      ) : null}
      {canWithdraw ? (
        <Button
          variant="ghost"
          onClick={async () => {
            const reason = await promptDialog({
              title: "Withdraw this job?",
              description: "Providers can no longer propose and active proposals are marked not selected. It costs nothing.",
              input: { label: "Reason", required: true },
              confirmLabel: "Withdraw",
            });
            if (reason) await run(withdrawJobAction(orgId, jobId, reason));
          }}
        >
          <XCircle /> Withdraw
        </Button>
      ) : null}
    </div>
  );
}

function InviteDialog({ orgId, jobId, category }: { orgId: string; jobId: string; category: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState(category);
  const [list, setList] = React.useState<ProviderCard[] | null>(null);
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const res = await searchProvidersAction(orgId, q, cat, "");
      if (res.status === "error") setError(res.message);
      else if (res.status === "success") setList((res.data as ProviderCard[] | undefined) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, cat, orgId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <UserPlus /> Invite providers
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite providers" description="Invited providers are alerted and can see the job even when it's invitation only. The same fees apply.">
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Business name" aria-label="Search providers" className={cn("pl-9", SEARCH_FIELD)} />
            </div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Service" className="select-chevron h-10 rounded-[8px] border border-stroke-strong bg-surface px-3 text-[14px]">
              <option value="">Any service</option>
              {(Object.keys(PROVIDER_CATEGORIES) as ProviderCategory[]).map((k) => (
                <option key={k} value={k}>
                  {PROVIDER_CATEGORIES[k]}
                </option>
              ))}
            </select>
          </div>
          <ul className="max-h-[50vh] divide-y divide-stroke overflow-y-auto rounded-[10px] border border-stroke">
            {list === null ? (
              <li className="px-3 py-4 text-center text-[13.5px] text-ink-muted">Searching…</li>
            ) : list.length === 0 ? (
              <li className="px-3 py-4 text-center text-[13.5px] text-ink-muted">No verified providers match.</li>
            ) : (
              list.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={chosen.includes(p.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))}
                      className="mt-1 size-4 accent-[var(--brand)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
                        {p.name} <BadgeCheck className="size-4 text-ok-ink" aria-label="Verified" />
                      </span>
                      <span className="block text-[12.5px] text-ink-muted">
                        {p.categories.map((c) => PROVIDER_CATEGORIES[c as ProviderCategory] ?? c).join(", ")}
                        {p.regions.length ? ` · ${p.regions.join(", ")}` : ""}
                        {p.mobile_service ? " · Mobile" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button
              disabled={busy || chosen.length === 0}
              onClick={async () => {
                setBusy(true);
                const res = await inviteProvidersAction(orgId, jobId, chosen);
                setBusy(false);
                if (res.status === "error") return setError(res.message);
                toast.success(`Invited ${chosen.length} provider${chosen.length === 1 ? "" : "s"}`);
                setOpen(false);
                setChosen([]);
                router.refresh();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null} Invite {chosen.length || ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
