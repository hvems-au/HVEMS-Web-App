import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { KIND_LABELS, ROLE_LABELS } from "@hvems/permissions";
import { Logo } from "@/components/brand/logo";
import { FormAlert } from "@/components/ui/form";
import { getContexts, getStaffContext, portalPath, requireUser } from "@/lib/session";
import { firstParam, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Choose where to work" };

export default async function SelectContextPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("/select-context");
  const [contexts, staff, sp] = await Promise.all([getContexts(), getStaffContext(), searchParams]);
  const reset = firstParam(sp.reset);

  if (contexts.length === 0 && !staff) redirect("/onboarding");
  if (contexts.length === 1 && !staff && !reset) redirect(portalPath(contexts[0]!));

  const groups = [
    { title: "Customer Portal", items: contexts.filter((c) => c.kind !== "provider") },
    { title: "Provider Portal", items: contexts.filter((c) => c.kind === "provider") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mx-auto mb-8 w-48">
          <Logo variant="horizontal" priority />
        </div>
        <div className="card px-6 py-7">
          <h1 className="text-h1 text-ink">Where would you like to work?</h1>
          <p className="mt-1 text-[14px] text-ink-subtle">Each organisation and portal shows only its own records.</p>
          {reset ? (
            <div className="mt-4">
              <FormAlert tone="success">Your password has been changed.</FormAlert>
            </div>
          ) : null}
          {groups.map((g) => (
            <section key={g.title} className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand">{g.title}</h2>
              <ul className="flex flex-col gap-2">
                {g.items.map((c) => (
                  <li key={c.organisation_id}>
                    <Link
                      href={portalPath(c)}
                      className="flex items-center gap-3 rounded-[10px] border border-stroke bg-white px-3.5 py-3 transition-colors hover:border-brand"
                    >
                      <span className="flex size-10 items-center justify-center rounded-full bg-shade text-[13px] font-bold text-white">{initials(c.organisation_name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{c.organisation_name}</span>
                        <span className="block truncate text-[13px] text-ink-subtle">
                          {KIND_LABELS[c.kind]} · {ROLE_LABELS[c.role]}
                        </span>
                      </span>
                      <ChevronRight className="size-5 text-ink-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {staff ? (
            <section className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand">HVEMS staff</h2>
              <p className="text-[14px] text-ink-muted">
                The administration console is served on its own address and always requires multi-factor authentication.
              </p>
            </section>
          ) : null}
          <Link href="/onboarding" className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-link hover:underline">
            <Plus className="size-4" /> Create a company, marketplace or provider account
          </Link>
        </div>
      </div>
    </div>
  );
}
