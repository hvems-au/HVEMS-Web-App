"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { generateMfaRecoveryCodes, getMfaRecoveryStatus, type MfaRecoveryStatus } from "@hvems/api-client";
import { formatDateAU } from "@hvems/domain";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { redeemRecoveryCodeAction } from "./actions";

async function loadPhase(): Promise<Phase> {
  const auth = getSupabaseBrowserClient().auth;
  const [{ data: factors }, { data: aal }] = await Promise.all([auth.mfa.listFactors(), auth.mfa.getAuthenticatorAssuranceLevel()]);
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) return { kind: "none" };
  return aal?.currentLevel === "aal2" ? { kind: "verified", factorId: totp.id } : { kind: "challenge", factorId: totp.id };
}

type Phase =
  | { kind: "loading" }
  | { kind: "none"; notice?: string }
  | { kind: "enrolling"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "verified"; factorId: string }
  | { kind: "codes"; codes: string[]; afterEnrol: boolean };

/** TOTP multi-factor authentication: enrolment, sign-in challenge, recovery codes and status (SoW §2.5, ACC-03). */
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

  async function verify(factorId: string, afterEnrol: boolean) {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const db = getSupabaseBrowserClient();
    const { error: err } = await db.auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setBusy(false);
      return setError("That code didn't work. Check the time on your phone and try the latest code.");
    }
    setCode("");
    if (afterEnrol) {
      // New authenticator: issue recovery codes straight away, while the person is here to save them.
      const codes = await generateMfaRecoveryCodes(db).catch(() => null);
      setBusy(false);
      if (codes?.length) return setPhase({ kind: "codes", codes, afterEnrol: true });
      toast.error("Your authenticator is set up, but recovery codes couldn't be created. Create them below.");
      return setPhase({ kind: "verified", factorId });
    }
    setBusy(false);
    router.push(next);
    router.refresh();
  }

  if (phase.kind === "loading") return <p className="text-[14px] text-ink-subtle">Checking your security settings…</p>;

  const codeField = (factorId: string, label: string, afterEnrol: boolean) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(factorId, afterEnrol);
      }}
      className="flex flex-col gap-4"
    >
      <Field label={label} htmlFor="totp" error={error ?? undefined}>
        <Input
          id="totp"
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

  if (phase.kind === "codes") {
    return (
      <RecoveryCodesList
        codes={phase.codes}
        afterEnrol={phase.afterEnrol}
        onDone={() => {
          if (phase.afterEnrol) {
            router.push(next);
            router.refresh();
          } else {
            void loadPhase().then(setPhase);
          }
        }}
      />
    );
  }

  if (phase.kind === "verified") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-[10px] border border-ok/30 bg-ok-soft p-4">
          <ShieldCheck className="mt-0.5 size-5 text-ok-ink" aria-hidden />
          <div>
            <p className="font-semibold text-ok-ink">Multi-factor authentication is on</p>
            <p className="text-[13px] text-ink-muted">This session is verified with your authenticator app.</p>
            <Button className="mt-3" size="sm" onClick={() => router.push(next)}>
              Continue
            </Button>
          </div>
        </div>
        <RecoveryCodesStatus onCreated={(codes) => setPhase({ kind: "codes", codes, afterEnrol: false })} />
      </div>
    );
  }

  if (phase.kind === "challenge") {
    return (
      <ChallengeWithRecovery
        codeForm={codeField(phase.factorId, "MFA code", false)}
        onRecovered={(message) => {
          setError(null);
          setPhase({ kind: "none", notice: message });
        }}
      />
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
        {codeField(phase.factorId, "6-digit code", true)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {phase.notice ? <FormAlert tone="success">{phase.notice}</FormAlert> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p className="text-[14px] text-ink-muted">
        Install an authenticator app on your phone (for example Microsoft Authenticator or Google Authenticator). You&apos;ll enter its 6-digit
        code each time you sign in.
      </p>
      <Button onClick={() => void enrol()} disabled={busy}>
        {busy ? "Starting…" : "Set up authenticator app"}
      </Button>
    </div>
  );
}

/** Sign-in challenge, with a way in for someone who has lost their phone. */
function ChallengeWithRecovery({ codeForm, onRecovered }: { codeForm: React.ReactNode; onRecovered: (message: string) => void }) {
  const [recovering, setRecovering] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (!recovering) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-ink-muted">Open your authenticator app and enter the 6-digit code shown for HVEMS.</p>
        {codeForm}
        <button type="button" className="self-center text-[13.5px] text-link hover:underline" onClick={() => setRecovering(true)}>
          Lost your phone? Use a recovery code
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await redeemRecoveryCodeAction(value);
          if (res.status === "success") onRecovered(res.message ?? "Recovery code accepted.");
          else if (res.status === "error") setError(res.message);
        });
      }}
    >
      <p className="text-[14px] text-ink-muted">
        Enter one of the recovery codes you saved when you set up MFA. Each code works once. Your old authenticator will be removed and you&apos;ll set
        up a new one straight away.
      </p>
      <Field label="Recovery code" htmlFor="recovery" error={error ?? undefined}>
        <Input
          id="recovery"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCDE-23456"
          maxLength={20}
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="h-12 text-center font-mono text-[18px] tracking-[0.2em]"
        />
      </Field>
      <Button type="submit" disabled={pending || value.trim().length < 10}>
        {pending ? "Checking…" : "Use recovery code"}
      </Button>
      <p className="text-center text-[13px] text-ink-subtle">
        No codes left? Ask your company Owner or Company Admin to reset your MFA. Owners can contact HVEMS support.
      </p>
      <button type="button" className="self-center text-[13.5px] text-link hover:underline" onClick={() => setRecovering(false)}>
        Back to authenticator code
      </button>
    </form>
  );
}

/** How many recovery codes are left, with a way to create a new set. */
function RecoveryCodesStatus({ onCreated }: { onCreated: (codes: string[]) => void }) {
  const [status, setStatus] = React.useState<MfaRecoveryStatus | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    let alive = true;
    void getMfaRecoveryStatus(getSupabaseBrowserClient())
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ remaining: 0, generated_at: null }));
    return () => {
      alive = false;
    };
  }, []);

  const create = () => {
    if (status && status.remaining > 0 && !window.confirm("Create a new set of recovery codes? Your current codes will stop working.")) return;
    start(async () => {
      try {
        onCreated(await generateMfaRecoveryCodes(getSupabaseBrowserClient()));
      } catch {
        toast.error("Recovery codes couldn't be created. Please try again.");
      }
    });
  };

  const low = status !== null && status.remaining <= 2;
  return (
    <section className="rounded-[10px] border border-stroke p-4">
      <div className="flex items-start gap-3">
        {low ? <TriangleAlert className="mt-0.5 size-5 text-warn-ink" aria-hidden /> : <KeyRound className="mt-0.5 size-5 text-ink-muted" aria-hidden />}
        <div className="flex-1">
          <h2 className="font-semibold text-ink">Recovery codes</h2>
          {status === null ? (
            <p className="text-[13px] text-ink-subtle">Checking…</p>
          ) : status.remaining === 0 ? (
            <p className="text-[13px] text-warn-ink">
              You have no recovery codes. If you lose your phone you won&apos;t be able to sign in on your own. Create them now and keep them somewhere safe.
            </p>
          ) : (
            <p className="text-[13px] text-ink-muted">
              {status.remaining} unused {status.remaining === 1 ? "code" : "codes"}
              {status.generated_at ? `, created ${formatDateAU(new Date(status.generated_at))}` : ""}. Use one if you lose your phone.
              {low ? " You're running low, so create a new set." : ""}
            </p>
          )}
          <Button className="mt-3" size="sm" variant={status?.remaining === 0 ? "primary" : "secondary"} disabled={pending || status === null} onClick={create}>
            {pending ? "Creating…" : status?.remaining === 0 ? "Create recovery codes" : "Create new recovery codes"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** A new set of codes, shown once. */
function RecoveryCodesList({ codes, afterEnrol, onDone }: { codes: string[]; afterEnrol: boolean; onDone: () => void }) {
  const [saved, setSaved] = React.useState(false);
  const text = `HVEMS MFA recovery codes\nCreated ${formatDateAU(new Date())}\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-4">
      {afterEnrol ? <FormAlert tone="success">Your authenticator app is set up.</FormAlert> : null}
      <div>
        <h2 className="font-semibold text-ink">Save your recovery codes</h2>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          If you lose your phone, one of these codes lets you back in. Each code works once. This is the only time they&apos;re shown, so print them or
          store them in a password manager. Don&apos;t keep them on the same phone as your authenticator app.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-[10px] border border-stroke bg-surface-muted p-4 font-mono text-[15px] tracking-[0.08em] text-ink">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            toast.success("Codes copied");
          }}
        >
          <Copy /> Copy
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: "hvems-recovery-codes.txt" });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> Download
        </Button>
      </div>
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" className="size-4 accent-brand" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I&apos;ve saved these codes somewhere safe
      </label>
      <Button disabled={!saved} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}
