"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { sendMessageAction } from "./actions";

export type ThreadMessage = { id: string; mine: boolean; who: string; body: string; when: string; masked: boolean; clarification: boolean };

/** A private question thread between the poster and one provider (MKT-08). */
export function MessageThread({
  jobId,
  providerId,
  messages,
  portalPath,
  canSend,
  placeholder = "Ask a question about the job",
}: {
  jobId: string;
  providerId: string;
  messages: ThreadMessage[];
  portalPath: string;
  canSend: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? <p className="text-[13.5px] text-ink-muted">No messages yet.</p> : null}
      <ul className="flex flex-col gap-2.5">
        {messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[14px]", m.mine ? "self-end bg-brand-soft text-ink" : "self-start bg-surface-muted text-ink")}>
            <p className="mb-0.5 text-[12px] text-ink-subtle">
              {m.clarification ? "Clarification to everyone · " : ""}
              {m.who} · {m.when}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
            {m.masked ? (
              <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-subtle">
                <ShieldAlert className="size-3.5" aria-hidden /> Contact details are hidden until an engagement is confirmed.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {canSend ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            setBusy(true);
            const res = await sendMessageAction(jobId, providerId, body, portalPath);
            setBusy(false);
            if (res.status === "error") return toast.error(res.message);
            setBody("");
            router.refresh();
          }}
        >
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder={placeholder} aria-label="Message" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-ink-subtle">Phone numbers, emails and links are hidden until an engagement is confirmed.</p>
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Send
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
