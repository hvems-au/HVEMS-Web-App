import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import { Card, CardBody } from "@/components/ui/primitives";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Operator Sign-in" };

/** Operator portal home: scan the QR label (opens the equipment directly) or type its code. */
export default function DriverPortalPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-h2 text-ink">Pre-start</h1>
      <p className="mt-1 text-[15px] text-ink-muted">Scan the HVEMS QR label on the vehicle or machine with your phone camera. No camera? Type the code instead.</p>
      <Card className="mt-5">
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-[10px] bg-surface-muted p-3 text-[14px] text-ink">
            <QrCode className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            Then sign in with your Operator ID and PIN. Your company gives you these.
          </div>
          <CodeForm />
        </CardBody>
      </Card>
    </div>
  );
}
