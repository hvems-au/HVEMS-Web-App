"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { idleState, type ClientActionState } from "@/lib/client-state";
import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "./actions";

function IconInput({ icon: Icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ElementType }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
      <Input className="h-12 pl-11 text-[15px]" {...props} />
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
      <Input className="h-12 pr-11 pl-11 text-[15px]" type={show ? "text" : "password"} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-ink hover:bg-surface-muted"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function fe(state: ClientActionState, key: string) {
  return state.status === "error" ? state.fieldErrors?.[key] : undefined;
}

export function SignInForm({ next, allowSignUp = true }: { next?: string; allowSignUp?: boolean }) {
  const [state, action, pending] = React.useActionState(signInAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.status === "error" ? <FormAlert>{state.message}</FormAlert> : null}
      <Field label="Email Address" htmlFor="email" error={fe(state, "email")}>
        <IconInput icon={Mail} name="email" type="email" autoComplete="email" placeholder="you@company.com.au" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe(state, "password")}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-1 flex justify-end">
        <Link href="/forgot-password" className="text-[14px] text-link hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="h-[49px] text-[18px]" disabled={pending}>
        {pending ? "Signing in…" : "Login"} <ArrowRight className="!size-5" />
      </Button>
      {allowSignUp ? (
        <>
          <div className="flex items-center gap-3 text-[14px] font-medium text-ink-subtle">
            <span className="h-px flex-1 bg-stroke" /> OR <span className="h-px flex-1 bg-stroke" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium text-ink">New to HVEMS?</p>
              <p className="text-[12.5px] text-ink-subtle">Create your account to manage equipment or find work.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="h-9 px-4">
              <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"}>Sign Up</Link>
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = React.useActionState(signUpAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.status === "error" ? <FormAlert>{state.message}</FormAlert> : null}
      <Field label="Full name" htmlFor="fullName" error={fe(state, "fullName")}>
        <IconInput icon={User} name="fullName" autoComplete="name" required />
      </Field>
      <Field label="Email Address" htmlFor="email" error={fe(state, "email")}>
        <IconInput icon={Mail} name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe(state, "password")} hint="At least 10 characters, including a number or symbol.">
        <PasswordInput name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={fe(state, "confirmPassword")}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <div>
        <label className="flex items-start gap-2.5 text-[14px] text-ink">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-5 accent-[var(--brand)]" />
          <span>
            I agree to the HVEMS terms of use and privacy policy.
            <span className="block text-[12.5px] text-ink-subtle">Terms are pending HVEMS&apos;s specialist review (SoW A-02).</span>
          </span>
        </label>
        {fe(state, "acceptTerms") ? <p className="mt-1 text-[13px] text-danger">{fe(state, "acceptTerms")}</p> : null}
      </div>
      <Button type="submit" size="lg" className="mt-1 h-[49px] text-[17px]" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-[14px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = React.useActionState(forgotPasswordAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" ? <FormAlert>{state.message}</FormAlert> : null}
      {state.status === "success" ? <FormAlert tone="success">{state.message}</FormAlert> : null}
      <Field label="Email Address" htmlFor="email" error={fe(state, "email")}>
        <IconInput icon={Mail} name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" size="lg" className="h-[49px]" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-center text-[14px] text-link hover:underline">
        Back to login
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = React.useActionState(resetPasswordAction, idleState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" ? <FormAlert>{state.message}</FormAlert> : null}
      <Field label="New password" htmlFor="password" error={fe(state, "password")} hint="At least 10 characters, including a number or symbol.">
        <PasswordInput name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={fe(state, "confirmPassword")}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" className="h-[49px]" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
