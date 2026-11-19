import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { getPersonNames, getProviderProfile, listMarketplaceRegions, listProviderBadges, listProviderDocuments, signProviderDocuments } from "@hvems/api-client";
import { formatAbn, formatDateTimeAU, todayISO } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { BADGE_LABELS, PROVIDER_CATEGORIES, VERIFICATION_STATUS, dmy, type ProviderCategory } from "@/features/marketplace/labels";
import { SuspendButton, VerificationDecision } from "@/features/marketplace/verification-decision";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review provider" };

const KIND: Record<string, string> = { public_liability: "Public liability", qualification: "Qualification", licence: "Licence", other: "Other" };

/** One provider's application: profile, documents, existing badges and the decision. */
export default async function ReviewProviderPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const staff = await getStaffContext();
  const db = await createSupabaseServerClient();
  const [profile, org, docs, badges, regions] = await Promise.all([
    getProviderProfile(db, orgId),
    db.from("organisations").select("id, name, legal_name, abn, created_at").eq("id", orgId).maybeSingle(),
    listProviderDocuments(db, orgId),
    listProviderBadges(db, orgId),
    listMarketplaceRegions(db),
  ]);
  if (!profile || !org.data) notFound();
  const links = await signProviderDocuments(
    db,
    docs.map((d) => d.path),
  );
  const names = await getPersonNames(db, [profile.decided_by, ...badges.map((b) => b.checked_by)]);
  const today = todayISO();
  const st = VERIFICATION_STATUS[profile.status];
  const regionName = new Map(regions.map((r) => [r.code, r.name]));
  const canDecide = staff?.role === "platform_administrator" || !!staff?.authorities.includes("verification_officer");
  const o = org.data;

  return (
    <>
      <PageHeader
        title={o.name}
        description={`ABN ${o.abn ? formatAbn(o.abn) : "—"}${o.legal_name ? ` · ${o.legal_name}` : ""}`}
        breadcrumb={{ label: "Verification", href: "/admin/verification" }}
        actions={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {staff?.role === "platform_administrator" && ["verified", "suspended"].includes(profile.status) ? <SuspendButton orgId={orgId} suspended={profile.status === "suspended"} /> : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          {profile.status === "submitted" ? (
            <Card>
              <CardHeader title="Decision" description="Badges are created only by this decision, and record what you checked." />
              <CardBody className="pt-0">
                <VerificationDecision
                  orgId={orgId}
                  abn={o.abn}
                  businessName={o.legal_name ?? o.name}
                  today={today}
                  canDecide={canDecide}
                  docs={docs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, expiresOn: d.expires_on, url: links.get(d.path) ?? null }))}
                />
              </CardBody>
            </Card>
          ) : profile.decided_at ? (
            <Card>
              <CardBody>
                <p className="text-[14px]">
                  {st.label} by {names.get(profile.decided_by ?? "") ?? "—"} on {formatDateTimeAU(new Date(profile.decided_at))}.
                  {profile.decision_reason ? ` Note: ${profile.decision_reason}` : ""}
                </p>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Documents" />
            <CardBody className="pt-0">
              {docs.length === 0 ? (
                <p className="text-[14px] text-ink-muted">None uploaded.</p>
              ) : (
                <ul className="divide-y divide-stroke">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                      <span>
                        {links.get(d.path) ? (
                          <a href={links.get(d.path)} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">
                            {d.title}
                          </a>
                        ) : (
                          d.title
                        )}
                        <span className="block text-[12.5px] text-ink-muted">
                          {KIND[d.kind]}
                          {d.category ? ` · ${PROVIDER_CATEGORIES[d.category as ProviderCategory] ?? d.category}` : ""} · uploaded {dmy(d.uploaded_at)}
                        </span>
                      </span>
                      {d.expires_on ? <Badge tone={d.expires_on < today ? "red" : "grey"}>Expires {dmy(d.expires_on)}</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="flex flex-col gap-2 pt-0 text-[14px]">
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Services</span>
                {profile.categories.map((c) => PROVIDER_CATEGORIES[c] ?? c).join(", ") || "—"}
              </p>
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Service area</span>
                {[profile.region_codes.map((r) => regionName.get(r) ?? r).join(", "), profile.base_suburb ? `${profile.base_suburb} + ${profile.radius_km ?? "?"} km` : null].filter(Boolean).join(" · ") || "—"}
              </p>
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Mobile service / urgent</span>
                {profile.mobile_service ? "Mobile" : "Workshop only"} · {profile.accepting_urgent ? "Accepts urgent jobs" : "No urgent jobs"}
              </p>
              {profile.workshop_address ? (
                <p>
                  <span className="block text-[12.5px] text-ink-subtle">Workshop</span>
                  {profile.workshop_address}
                </p>
              ) : null}
              <p>
                <span className="block text-[12.5px] text-ink-subtle">Contact</span>
                {[profile.contact_name, profile.contact_phone, profile.contact_email].filter(Boolean).join(" · ") || "—"}
              </p>
              {profile.description ? <p className="whitespace-pre-wrap text-ink-muted">{profile.description}</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Current badges" />
            <CardBody className="pt-0">
              {badges.length === 0 ? (
                <p className="text-[14px] text-ink-muted">None.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-[13.5px]">
                  {badges.map((b) => (
                    <li key={b.id}>
                      <span className="flex items-center gap-1.5 font-medium">
                        <BadgeCheck className="size-4 text-ok-ink" aria-hidden /> {BADGE_LABELS[b.kind]}
                      </span>
                      <span className="block text-ink-muted">{b.details}</span>
                      <span className="block text-[12px] text-ink-subtle">
                        {names.get(b.checked_by) ?? "—"}, {dmy(b.checked_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
