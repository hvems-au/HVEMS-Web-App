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
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
      <Input className="h-11 pl-10 text-[15px]" {...props} />
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
      <Input className="h-11 pr-11 pl-10 text-[15px]" type={show ? "text" : "password"} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[6px] p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function fe<T>(state: ClientActionState<T>, key: string) {
  return state.status === "error" ? state.fieldErrors?.[key] : undefined;
}

export function SignInForm({ next, allowSignUp = true }: { next?: string; allowSignUp?: boolean }) {
  const [state, action, pending] = React.useActionState(signInAction, idleState as ClientActionState<{ redirectTo: string }>);
  const redirectTo = state.status === "success" ? state.data?.redirectTo : undefined;
  React.useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.status === "error" ? <FormAlert>{state.message}</FormAlert> : null}
      <Field label="Email address" htmlFor="email" error={fe(state, "email")}>
        <IconInput icon={Mail} name="email" type="email" autoComplete="email" placeholder="you@company.com.au" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe(state, "password")}>
        <PasswordInput name="password" autoComplete="current-password" placeholder="Enter your password" required />
      </Field>
      <div className="-mt-2 flex justify-end">
        <Link href="/forgot-password" className="text-[13.5px] font-medium text-link hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="h-11 text-[15px]" disabled={pending || !!redirectTo}>
        {pending || redirectTo ? "Signing in…" : "Sign in"} <ArrowRight className="!size-[18px]" />
      </Button>
      {allowSignUp ? (
        <p className="border-t border-stroke pt-5 text-center text-[13.5px] text-ink-muted">
          New to HVEMS?{" "}
          <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"} className="font-semibold text-link hover:underline">
            Create an account
          </Link>
        </p>
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
        <IconInput icon={User} name="fullName" autoComplete="name" placeholder="e.g. Alex Smith" required />
      </Field>
      <Field label="Email address" htmlFor="email" error={fe(state, "email")}>
        <IconInput icon={Mail} name="email" type="email" autoComplete="email" placeholder="you@company.com.au" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe(state, "password")} hint="At least 10 characters, including a number or symbol.">
        <PasswordInput name="password" autoComplete="new-password" placeholder="At least 10 characters" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={fe(state, "confirmPassword")}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" placeholder="Re-enter your password" required />
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
      <Button type="submit" size="lg" className="mt-1 h-11 text-[15px]" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-[14px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-ink hover:underline">
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
      <Field label="Email address" htmlFor="email" error={fe(state, "email")}>
        <IconInput icon={Mail} name="email" type="email" autoComplete="email" placeholder="you@company.com.au" required />
      </Field>
      <Button type="submit" size="lg" className="h-11 text-[15px]" disabled={pending}>
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
        <PasswordInput name="password" autoComplete="new-password" placeholder="At least 10 characters" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={fe(state, "confirmPassword")}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" placeholder="Re-enter your new password" required />
      </Field>
      <Button type="submit" size="lg" className="h-11 text-[15px]" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
