"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function loadPhase(): Promise<Phase> {
  const auth = getSupabaseBrowserClient().auth;
  const [{ data: factors }, { data: aal }] = await Promise.all([auth.mfa.listFactors(), auth.mfa.getAuthenticatorAssuranceLevel()]);
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) return { kind: "none" };
  return aal?.currentLevel === "aal2" ? { kind: "verified", factorId: totp.id } : { kind: "challenge", factorId: totp.id };
}

type Phase =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "enrolling"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "verified"; factorId: string };

/** TOTP multi-factor authentication: enrolment, sign-in challenge and status (SoW §2.5). */
export function MfaPanel({ next }: { next: string }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void loadPhase().then((p) => {
      if (alive) setPhase(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enrol() {
    setBusy(true);
    setError(null);
    const auth = getSupabaseBrowserClient().auth;
    // Remove abandoned unverified factors so enrolment can be retried.
    const { data: factors } = await auth.mfa.listFactors();
    for (const f of factors?.all ?? []) if (f.status === "unverified") await auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `HVEMS ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (err || !data) return setError("Could not start set-up. Please try again.");
    setPhase({ kind: "enrolling", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(factorId: string) {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (err) return setError("That code didn't work. Check the time on your phone and try the latest code.");
    setCode("");
    router.push(next);
    router.refresh();
  }

  if (phase.kind === "loading") return <p className="text-[14px] text-ink-subtle">Checking your security settings…</p>;

  const codeField = (factorId: string, label: string) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(factorId);
      }}
      className="flex flex-col gap-4"
    >
      <Field label={label} htmlFor="totp" error={error ?? undefined}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="h-12 text-center text-[20px] tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );

  if (phase.kind === "verified") {
    return (
      <div className="flex items-start gap-3 rounded-[10px] border border-ok/30 bg-[#e8f7e7] p-4">
        <ShieldCheck className="mt-0.5 size-5 text-[#0a7a00]" aria-hidden />
        <div>
          <p className="font-semibold text-[#0a6b00]">Multi-factor authentication is on</p>
          <p className="text-[13px] text-ink-muted">This session is verified with your authenticator app.</p>
          <Button className="mt-3" size="sm" onClick={() => router.push(next)}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "challenge") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-ink-muted">Enter the code from your authenticator app to continue.</p>
        {codeField(phase.factorId, "Authentication code")}
      </div>
    );
  }

  if (phase.kind === "enrolling") {
    return (
      <div className="flex flex-col gap-4">
        <ol className="list-decimal pl-5 text-[14px] text-ink-muted">
          <li>Open an authenticator app (for example Microsoft Authenticator or Google Authenticator).</li>
          <li>Scan this QR code, or enter the key manually.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={phase.qr} alt="QR code for your authenticator app" className="mx-auto size-48 rounded-md border border-stroke bg-white p-2" />
        <p className="text-center font-mono text-[13px] break-all text-ink-muted">{phase.secret}</p>
        {codeField(phase.factorId, "6-digit code")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p className="text-[14px] text-ink-muted">
        Protect your account with an authenticator app. You&apos;ll enter a 6-digit code when you sign in.
      </p>
      <Button onClick={() => void enrol()} disabled={busy}>
        {busy ? "Starting…" : "Set up authenticator app"}
      </Button>
    </div>
  );
}
