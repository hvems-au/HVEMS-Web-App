import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { formatShortCode } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import type { EquipmentCode } from "@hvems/types";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { portalOrigin } from "@/lib/portals";
import { GenerateCodeButton, ReplaceCodeButton } from "./code-buttons";

export function equipmentCodeUrl(token: string) {
  return `${portalOrigin("company")}/driver/e/${token}`;
}

/**
 * The equipment's QR code (O-10): generated on request, linked to this
 * equipment only. Scanning opens the pre-start after the operator signs in.
 */
export async function QrCard({
  orgId,
  assetId,
  code,
  canManage,
  timezone,
}: {
  orgId: string;
  assetId: string;
  code: EquipmentCode | null;
  canManage: boolean;
  timezone: string;
}) {
  if (!code) {
    return (
      <Card>
        <CardHeader title="QR code" description="Fit a QR label so operators can scan it, sign in and do the pre-start." />
        <CardBody>
          {canManage ? <GenerateCodeButton orgId={orgId} assetId={assetId} /> : <p className="text-[14px] text-ink-muted">No QR code yet. A manager can generate one.</p>}
        </CardBody>
      </Card>
    );
  }
  const svg = await QRCode.toString(equipmentCodeUrl(code.token), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2b2b2b", light: "#ffffff" } });
  return (
    <Card>
      <CardHeader title="QR code" description="Scan to sign in and do the pre-start" action={canManage ? <ReplaceCodeButton orgId={orgId} assetId={assetId} /> : null} />
      <CardBody className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="size-36 shrink-0 rounded-[8px] border border-stroke p-1.5 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="flex flex-col gap-2 text-[14px]">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-ink-subtle">Code to type</p>
            <p className="font-mono text-[18px] font-bold tracking-wider text-ink">{formatShortCode(code.short_code)}</p>
          </div>
          <p className="text-[12.5px] text-ink-subtle">Generated {formatDateTimeAU(new Date(code.created_at), timezone)}</p>
          <Button asChild variant="secondary" size="sm">
            {/* A plain link: the label is a PDF download. */}
            <a href={`/customer/${orgId}/equipment/${assetId}/label`} download>
              <Printer /> Print label
            </a>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
