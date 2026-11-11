import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { getAsset, getEquipmentPublic, getMyContexts, getPrestartChecklist, listDefects, signOrganisationLogo, type HvemsClient } from "@hvems/api-client";
import { DEFECT_SEVERITY_LABELS } from "@hvems/domain";
import { ConditionBadge } from "@/components/condition";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Dl } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { PrestartForm } from "../../../customer/[orgId]/equipment/[assetId]/prestart/prestart-form";
import { driverSignOutAction } from "../../actions";
import { DriverSignIn } from "./sign-in";

export const metadata: Metadata = { title: "Pre-start" };

/**
 * Scanned equipment (O-10): confirm the machine, sign in (Driver ID + PIN or a
 * member's own login), then the pre-start. The checklist and every answer are
 * checked by the database for the signed-in person, so each pre-start records
 * who did it, and drivers only see equipment they're permitted to operate.
 */
export default async function ScannedEquipmentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const eq = await getEquipmentPublic(createSupabaseAdminClient() as unknown as HvemsClient, code).catch(() => null);
  if (!eq) {
    return (
      <Card>
        <CardHeader title="Code not recognised" description="This QR code or equipment code isn't active. The label may have been replaced, or the equipment archived." />
        <CardBody>
          <Button asChild variant="secondary">
            <Link href="/driver">Type a code instead</Link>
          </Button>
        </CardBody>
      </Card>
    );
  }

  // The company's logo (private storage), read with the service role like the code lookup.
  const admin = createSupabaseAdminClient() as unknown as HvemsClient;
  const { data: orgRow } = await admin.from("organisations").select("logo_path").eq("id", eq.organisation_id).maybeSingle();
  const logoUrl = await signOrganisationLogo(admin, orgRow?.logo_path, 600).catch(() => null);

  const machine = (
    <Card className="mb-4">
      <CardBody className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link from private storage
            <img src={logoUrl} alt={eq.company} className="mb-1.5 h-9 max-w-[180px] object-contain object-left" />
          ) : null}
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{eq.company}</p>
          <p className="text-h4 font-bold text-ink">{eq.asset_number}</p>
          <p className="text-[14px] text-ink-muted">{[eq.class, eq.make, eq.model].filter(Boolean).join(" · ")}</p>
        </div>
        <ConditionBadge condition={eq.condition} />
      </CardBody>
    </Card>
  );

  const user = await getSessionUser();
  const db = await createSupabaseServerClient();
  const member = user ? (await getMyContexts(db).catch(() => [])).find((c) => c.organisation_id === eq.organisation_id) : undefined;

  if (!user || !member) {
    return (
      <div className="mx-auto max-w-md">
        {machine}
        <Card>
          <CardHeader title="Sign in to do the pre-start" description="Your name is recorded on the pre-start." />
          <CardBody>
            {user && !member ? (
              <p className="mb-3 rounded-[8px] bg-warn-soft px-3 py-2 text-[13.5px] text-ink">
                You&apos;re signed in to a different company. Sign in for {eq.company} below.
              </p>
            ) : null}
            <DriverSignIn code={code} />
          </CardBody>
        </Card>
      </div>
    );
  }

  const signOut = (
    <form action={driverSignOutAction.bind(null, code)}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut /> Sign out
      </Button>
    </form>
  );
  const [checklist, asset, openDefects] = await Promise.all([
    getPrestartChecklist(db, eq.asset_id).catch(() => null),
    getAsset(db, eq.asset_id).catch(() => null),
    listDefects(db, { organisationId: eq.organisation_id, assetId: eq.asset_id, status: "open" }).catch(() => []),
  ]);

  const who = (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-stroke bg-white px-4 py-2.5">
      <p className="text-[14px] text-ink">
        Signed in as <strong>{user.fullName || user.email}</strong>
      </p>
      {signOut}
    </div>
  );

  if (!checklist || !asset) {
    return (
      <div className="mx-auto max-w-md">
        {who}
        {machine}
        <Card>
          <CardHeader title="Not permitted" description="You're not set up to operate this equipment. Ask your Fleet Manager to add it to your Driver profile." />
        </Card>
      </div>
    );
  }

  const tracksKm = asset.meter_type === "kilometres" || asset.meter_type === "both";
  const tracksHours = asset.meter_type === "hours" || asset.meter_type === "both";
  return (
    <>
      {who}
      <Card className="mb-4">
        <CardHeader title={`Pre-start · ${asset.asset_number}`} action={<ConditionBadge condition={asset.condition} />} />
        <CardBody>
          <Dl
            className="grid-cols-2 sm:grid-cols-3"
            items={[
              { label: "Make / Model", value: [asset.make, asset.model].filter(Boolean).join(" ") || "—" },
              { label: "Rego", value: asset.registration_number ? `${asset.registration_number} ${asset.registration_state ?? ""}`.trim() : "—" },
              { label: "VIN / Serial", value: asset.vin ?? asset.serial_number ?? "—" },
              ...(tracksKm ? [{ label: "Last odometer", value: asset.current_odometer_km === null ? "—" : `${formatNumber(asset.current_odometer_km)} km` }] : []),
              ...(tracksHours ? [{ label: "Last hour meter", value: asset.current_engine_hours === null ? "—" : `${formatNumber(asset.current_engine_hours, 1)} hours` }] : []),
              { label: "Operator", value: user.fullName || user.email },
            ]}
          />
          {openDefects.length ? (
            <div className="mt-4 rounded-[10px] border border-stroke bg-surface-muted/50 p-3">
              <p className="text-[13px] font-semibold text-ink">Already reported ({openDefects.length}): no need to report these again</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-ink-muted">
                {openDefects.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <Badge tone={d.severity === "critical" ? "red" : d.severity === "minor" ? "amber" : "grey"}>{DEFECT_SEVERITY_LABELS[d.severity]}</Badge>
                    {d.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>
      <PrestartForm
        orgId={eq.organisation_id}
        assetId={eq.asset_id}
        checklist={checklist}
        tracksKm={tracksKm}
        tracksHours={tracksHours}
        lastKm={asset.current_odometer_km}
        lastHours={asset.current_engine_hours}
        doneBase={`/driver/e/${encodeURIComponent(code)}/done`}
      />
    </>
  );
}
