import { getOrganisation, getSupportPin, signOrganisationLogo } from "@hvems/api-client";
import { KIND_LABELS, can } from "@hvems/permissions";
import { PageHeader } from "@/components/shell/page";
import type { OrgContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogoCard } from "./logo-card";
import { SupportPinCard } from "./support-pin-card";
import { SettingsForm } from "./settings-form";

export async function SettingsPage({ ctx, portal }: { ctx: OrgContext; portal: "customer" | "provider" }) {
  const db = await createSupabaseServerClient();
  const org = await getOrganisation(db, ctx.context.organisation_id);
  const editable = can(ctx.capabilities, "org.settings.manage");
  const logoUrl = await signOrganisationLogo(db, org.logo_path);
  // Support PIN (Owner and Company Admins).
  const supportPin = editable ? await getSupportPin(db, org.id).catch(() => null) : null;
  return (
    <>
      <PageHeader title="Settings" description={`${KIND_LABELS[org.kind]} details${org.kind === "company" ? " and company rules" : ""}`} />
      <SettingsForm
        portal={portal}
        org={{
          id: org.id,
          kind: org.kind,
          name: org.name,
          legal_name: org.legal_name ?? "",
          abn: org.abn ?? "",
          timezone: org.timezone,
          contact_name: org.contact_name ?? "",
          contact_email: org.contact_email ?? "",
          contact_phone: org.contact_phone ?? "",
          overdue: !!org.settings.overdue_service_sets_needs_attention,
          repairer: !!org.settings.repairer_cannot_clear_own_critical,
        }}
        editable={editable}
      />
      <div className="mt-5">
        <LogoCard portal={portal} orgId={org.id} logoUrl={logoUrl} editable={editable} />
      </div>
      {supportPin ? (
        <SupportPinCard
          portal={portal}
          orgId={org.id}
          pin={supportPin.pin}
          rotationHours={supportPin.rotation_hours}
          validUntilText={new Date(supportPin.valid_until).toLocaleTimeString("en-AU", { timeZone: ctx.timezone, hour: "numeric", minute: "2-digit" })}
        />
      ) : null}
    </>
  );
}
