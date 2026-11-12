"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { driverSignInAction, memberSignInAction, operatorSignInAction } from "../../actions";

type Mode = "pin" | "setup" | "email";

/**
 * Operator ID + PIN; first time: setup code + new PIN; or a member's own email
 * login. On a scanned label (`code`) the label identifies the company; signing
 * in directly asks for the company code instead. `next` is where to go after
 * (an internal /driver path, checked by the caller).
 */
export function DriverSignIn({ code, next }: { code?: string; next?: string }) {
  const [companyCode, setCompanyCode] = React.useState("");
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("pin");
  const [driverId, setDriverId] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [pin1, setPin1] = React.useState("");
  const [pin2, setPin2] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "setup" && pin1 !== pin2) {
      setError("The two PINs don't match");
      return;
    }
    start(async () => {
      const newPin = mode === "setup" ? pin1 : undefined;
      const res =
        mode === "email"
          ? await memberSignInAction({ email, password })
          : code
            ? await driverSignInAction({ code, driverId, secret, newPin })
            : await operatorSignInAction({ companyCode, driverId, secret, newPin });
      if (res.status === "error") return setError(res.message);
      if (res.status !== "success") return;
      if (code) return router.refresh(); // the scanned page re-opens with the equipment selected
      router.push(next ?? "/driver");
      router.refresh();
    });
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => (setMode(m), setError(null), setSecret(""))}
      className={cn("flex-1 rounded-[6px] px-2 py-1.5 text-[13.5px] font-semibold", mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}
    >
      {label}
    </button>
  );
  const pinInput = (value: string, set: (v: string) => void, name: string) => (
    <Input
      name={name}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
      className="text-center font-mono text-[22px] tracking-[0.5em]"
      placeholder="••••••"
    />
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-[8px] bg-surface-muted p-1">
        {tab("pin", "Operator PIN")}
        {tab("setup", "First time")}
        {tab("email", "Email login")}
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {mode === "email" ? (
        <>
          <Field label="Email" htmlFor="m-email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com.au" />
          </Field>
          <Field label="Password" htmlFor="m-password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      ) : (
        <>
          {code ? null : (
            <Field label="Company code" htmlFor="d-company" hint="Your manager gives you this with your Operator ID">
              <Input
                id="d-company"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="organization"
                maxLength={8}
                placeholder="e.g. MM5GQY"
                className="font-mono text-[18px] tracking-widest uppercase"
              />
            </Field>
          )}
          <Field label="Operator ID" htmlFor="d-id">
            <Input
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              autoCapitalize="characters"
              autoComplete="username"
              placeholder="OP-0001"
              className="font-mono text-[18px] uppercase"
            />
          </Field>
          {mode === "pin" ? (
            <Field label="PIN" htmlFor="d-pin">
              {pinInput(secret, setSecret, "pin")}
            </Field>
          ) : (
            <>
              <Field label="Setup code" htmlFor="d-setup" hint="From your manager. It works once and expires after 72 hours.">
                <Input
                  value={secret}
                  onChange={(e) => setSecret(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  maxLength={8}
                  className="font-mono text-[18px] tracking-widest uppercase"
                />
              </Field>
              <Field label="Choose a 6-digit PIN" htmlFor="d-pin1">
                {pinInput(pin1, setPin1, "new-pin")}
              </Field>
              <Field label="Type the PIN again" htmlFor="d-pin2">
                {pinInput(pin2, setPin2, "new-pin-again")}
              </Field>
            </>
          )}
        </>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : mode === "setup" ? "Set PIN and continue" : "Sign in"}
      </Button>
    </form>
  );
}
