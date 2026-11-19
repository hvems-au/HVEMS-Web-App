"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { setPlatformSettingAction } from "./setting-actions";

/** Change one platform setting with a reason (ADM-08). The value keeps its type; the history records the change. */
export function SettingEditor({ settingKey, description, value }: { settingKey: string; description: string; value: unknown }) {
  const router = useRouter();
  const kind = typeof value;
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(kind === "string" ? String(value) : JSON.stringify(value));
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Change ${settingKey}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent title="Change setting" description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            let parsed: unknown;
            try {
              parsed = kind === "string" ? v : JSON.parse(v);
            } catch {
              return setError(kind === "number" ? "Enter a number" : "Enter a valid value");
            }
            setBusy(true);
            const res = await setPlatformSettingAction(settingKey, parsed, reason);
            setBusy(false);
            if (res.status === "error") return setError(res.message);
            toast.success("Setting changed");
            setOpen(false);
            setReason("");
            router.refresh();
          }}
        >
          {error ? <FormAlert>{error}</FormAlert> : null}
          <p className="font-mono text-[12.5px] text-ink-muted">{settingKey}</p>
          <Field label="New value" htmlFor="set-value" hint={kind === "number" ? "Money is in cents (e.g. 2900 = $29.00); times in the unit named in the setting" : undefined}>
            {kind === "boolean" ? (
              <Select id="set-value" value={v} onChange={(e) => setV(e.target.value)}>
                <option value="true">Yes / on</option>
                <option value="false">No / off</option>
              </Select>
            ) : (
              <Input id="set-value" value={v} inputMode={kind === "number" ? "decimal" : undefined} onChange={(e) => setV(e.target.value)} />
            )}
          </Field>
          <Field label="Reason" htmlFor="set-reason" required hint="Kept in the history with your name">
            <Input id="set-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              Save change
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
