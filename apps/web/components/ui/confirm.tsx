"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";

type Request = {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask for a note: resolves with the text (or null if cancelled). */
  input?: { label: string; hint?: string; required?: boolean };
  resolve: (value: string | boolean | null) => void;
};

let open: ((r: Request) => void) | null = null;

/** Yes/no in the HVEMS style (replaces window.confirm). Resolves true or false. */
export function confirmDialog(opts: Omit<Request, "resolve" | "input">): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open) return resolve(window.confirm(opts.title));
    open({ ...opts, resolve: (v) => resolve(v === true) });
  });
}

/** Ask for a note in the HVEMS style (replaces window.prompt). Resolves the text, or null if cancelled. */
export function promptDialog(opts: Omit<Request, "resolve"> & { input: NonNullable<Request["input"]> }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!open) return resolve(window.prompt(opts.title));
    open({ ...opts, resolve: (v) => resolve(typeof v === "string" ? v : null) });
  });
}

/** Mounted once in the root layout. */
export function ConfirmHost() {
  const [req, setReq] = React.useState<Request | null>(null);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    open = (r) => {
      setText("");
      setError(null);
      setReq(r);
    };
    return () => {
      open = null;
    };
  }, []);

  const finish = (value: string | boolean | null) => {
    req?.resolve(value);
    setReq(null);
  };

  return (
    <Dialog open={req !== null} onOpenChange={(o) => !o && finish(req?.input ? null : false)}>
      {req ? (
        <DialogContent title={req.title} description={req.description}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (req.input) {
                if (req.input.required && text.trim().length < 3) return setError("Add a short note (at least 3 characters).");
                finish(text.trim());
              } else finish(true);
            }}
          >
            {error ? <FormAlert>{error}</FormAlert> : null}
            {req.input ? (
              <Field label={req.input.label} htmlFor="confirm-input" required={req.input.required} hint={req.input.hint}>
                <Textarea id="confirm-input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              </Field>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => finish(req.input ? null : false)}>
                Back
              </Button>
              <Button type="submit" variant={req.danger ? "danger" : "primary"} autoFocus={!req.input}>
                {req.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
