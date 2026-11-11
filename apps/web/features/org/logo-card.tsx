"use client";
import * as React from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ORGANISATION_LOGO_BUCKET, organisationLogoPath } from "@hvems/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { setOrganisationLogoAction } from "./actions";

const MAX_SIDE = 1000;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Any image the browser can show (PNG, JPEG, WebP, SVG…) becomes a PNG of at
 * most 1000px, keeping transparency. Labels are PDFs, which take PNG or JPEG only.
 */
async function toPng(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read. Try a PNG or JPEG."));
      i.src = url;
    });
    const w = img.naturalWidth || 600;
    const h = img.naturalHeight || 200;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The logo couldn't be prepared. Try a PNG or JPEG.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Company logo (Settings): printed on equipment QR labels in place of the company name. */
export function LogoCard({ portal, orgId, logoUrl, editable }: { portal: string; orgId: string; logoUrl: string | null; editable: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file (PNG, JPEG, WebP or SVG).");
    if (file.size > MAX_INPUT_BYTES) return toast.error("That image is over 10 MB. Choose a smaller file.");
    setBusy(true);
    const db = getSupabaseBrowserClient();
    const path = organisationLogoPath(orgId, "png");
    try {
      const png = await toPng(file);
      const { error } = await db.storage.from(ORGANISATION_LOGO_BUCKET).upload(path, png, { contentType: "image/png", upsert: false });
      if (error) throw new Error("The logo couldn't be uploaded. You may not have permission to change settings.");
      const res = await setOrganisationLogoAction(portal, orgId, path);
      if (res.status === "error") {
        await db.storage.from(ORGANISATION_LOGO_BUCKET).remove([path]);
        throw new Error(res.message);
      }
      toast.success("Logo saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The logo couldn't be saved");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const res = await setOrganisationLogoAction(portal, orgId, null);
    setBusy(false);
    if (res.status === "error") toast.error(res.message);
    else toast.success("Logo removed");
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader title="Company logo" description="Printed on your equipment QR labels in place of the company name. A wide logo on a white or clear background works best." />
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-full items-center justify-center rounded-[10px] border border-dashed border-stroke bg-white p-3 sm:w-64">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link from private storage
            <img src={logoUrl} alt="Company logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[13px] text-ink-subtle">No logo yet</span>
          )}
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="animate-spin" /> : <ImageUp />} {logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {logoUrl ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
                <Trash2 /> Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
