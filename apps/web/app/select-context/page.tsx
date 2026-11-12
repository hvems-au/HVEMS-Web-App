import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ChevronRight, Plus } from "lucide-react";
import { KIND_LABELS, ROLE_LABELS } from "@hvems/permissions";
import type { MyContext } from "@hvems/types";
import { Logo } from "@/components/brand/logo";
import { FormAlert } from "@/components/ui/form";
import { contextHref, getCurrentPortal, portalServesContext } from "@/lib/current-portal";
import { PORTAL_FOR_ORG_KIND, PORTAL_INFO, type PortalId } from "@/lib/portals";
import { getContexts, portalPath, requireUser } from "@/lib/session";
import { firstParam, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Choose where to work" };

const CREATE_LABEL: Partial<Record<PortalId, string>> = {
  company: "Create another company",
  market: "Create another marketplace account",
  provider: "Create another provider account",
};

function ContextRow({ c, href, external }: { c: MyContext; href: string; external?: boolean }) {
  return (
    <li>
      <Link href={href} prefetch={external ? false : undefined} className="flex items-center gap-3 rounded-[10px] border border-stroke bg-surface px-3.5 py-3 transition-colors hover:border-brand">
        <span className="flex size-10 items-center justify-center rounded-full bg-shade text-[13px] font-bold text-white">{initials(c.organisation_name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{c.organisation_name}</span>
          <span className="block truncate text-[13px] text-ink-subtle">
            {KIND_LABELS[c.kind]} · {ROLE_LABELS[c.role]}
          </span>
        </span>
        {external ? <ArrowUpRight className="size-5 text-ink-subtle" aria-label="Opens another portal" /> : <ChevronRight className="size-5 text-ink-subtle" aria-hidden />}
      </Link>
    </li>
  );
}

export default async function SelectContextPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("/select-context");
  const [contexts, portal, sp] = await Promise.all([getContexts(), getCurrentPortal(), searchParams]);
  const reset = firstParam(sp.reset);
  const switchFailed = firstParam(sp.switch) === "failed";

  const here = contexts.filter((c) => portalServesContext(portal, c));
  const elsewhere = contexts.filter((c) => !portalServesContext(portal, c));

  if (here.length === 0 && elsewhere.length === 0) redirect("/onboarding");
  if (here.length === 1 && elsewhere.length === 0 && !reset && !switchFailed) redirect(portalPath(here[0]!));

  const otherPortals = (["company", "market", "provider"] as const)
    .filter((p) => p !== portal)
    .map((p) => ({ portal: p, items: elsewhere.filter((c) => PORTAL_FOR_ORG_KIND[c.kind] === p) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mx-auto mb-8 w-48">
          <Logo variant="horizontal" priority />
        </div>
        <div className="card px-6 py-7">
          <h1 className="text-h1 text-ink">Where would you like to work?</h1>
          <p className="mt-1 text-[14px] text-ink-subtle">{PORTAL_INFO[portal].name}. Each organisation shows only its own records.</p>
          {reset ? (
            <div className="mt-4">
              <FormAlert tone="success">Your password has been changed.</FormAlert>
            </div>
          ) : null}
          {switchFailed ? (
            <div className="mt-4">
              <FormAlert>We couldn&apos;t switch portals. Please try again, or sign in to that portal directly.</FormAlert>
            </div>
          ) : null}

          {here.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand-ink">{PORTAL_INFO[portal].name}</h2>
              <ul className="flex flex-col gap-2">
                {here.map((c) => (
                  <ContextRow key={c.organisation_id} c={c} href={portalPath(c)} />
                ))}
              </ul>
            </section>
          ) : (
            <p className="mt-6 text-[14px] text-ink-muted">You don&apos;t have an account in the {PORTAL_INFO[portal].name.toLowerCase()} yet.</p>
          )}

          {otherPortals.map((g) => (
            <section key={g.portal} className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Switch to the {PORTAL_INFO[g.portal].name}</h2>
              <ul className="flex flex-col gap-2">
                {g.items.map((c) => (
                  <ContextRow key={c.organisation_id} c={c} href={contextHref(c, portal)} external />
                ))}
              </ul>
            </section>
          ))}

          <Link href="/onboarding" className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-link hover:underline">
            <Plus className="size-4" /> {(CREATE_LABEL[portal] ?? "Create an account").replace(" another ", here.length ? " another " : " a ")}
          </Link>
        </div>
      </div>
    </div>
  );
}
