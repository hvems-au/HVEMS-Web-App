"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { equipmentCodeFromText } from "@/lib/equipment-code";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Scan the QR label with the phone camera. Uses the browser's own scanner where
 * there is one (Android Chrome) and jsQR otherwise (iPhone Safari). A scanned
 * equipment label opens the search with that code, which goes straight to the
 * equipment; anything else gets a clear message. Nothing leaves the phone except
 * the code.
 */
export function QrScanButton({ searchPath }: { searchPath: string }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className="h-12 shrink-0 px-3" aria-label="Scan QR label">
          <QrCode /> <span className="hidden min-[380px]:inline">Scan QR</span>
        </Button>
      </DialogTrigger>
      <DialogContent title="Scan the QR label" description="Point the camera at the QR code on the equipment.">
        {open ? <Scanner searchPath={searchPath} onDone={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Scanner({ searchPath, onDone }: { searchPath: string; onDone: () => void }) {
  const router = useRouter();
  const video = React.useRef<HTMLVideoElement>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("This browser can't use the camera. Type the code printed under the QR label instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setMessage("Camera access was blocked. Allow the camera for this site, or type the code printed under the QR label.");
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);

      const Native = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const native = Native ? new Native({ formats: ["qr_code"] }) : null;
      const jsQR = native ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (stopped || !video.current) return;
        const v = video.current;
        let text: string | null = null;
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            if (native) {
              text = (await native.detect(v))[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              const scale = Math.min(1, 640 / v.videoWidth);
              canvas.width = Math.round(v.videoWidth * scale);
              canvas.height = Math.round(v.videoHeight * scale);
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            text = null;
          }
        }
        if (text) {
          const code = equipmentCodeFromText(text);
          if (code) {
            stopped = true;
            const q = code.shortCode ?? code.token!;
            const sep = searchPath.includes("?") ? "&" : "?";
            onDone();
            router.push(`${searchPath}${sep}q=${encodeURIComponent(q)}`);
            return;
          }
          setMessage("That QR code isn't an HVEMS equipment label.");
        }
        timer = setTimeout(tick, 250);
      };
      tick();
    }
    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router, searchPath, onDone]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-black">
        <video ref={video} className="size-full object-cover" playsInline muted aria-label="Camera view" />
        <div className="pointer-events-none absolute inset-[18%] rounded-[16px] border-4 border-white/80" aria-hidden />
      </div>
      {message ? (
        <p role="status" className="text-[14px] text-ink">
          {message}
        </p>
      ) : (
        <p className="text-[13.5px] text-ink-muted">Hold steady; it opens automatically.</p>
      )}
    </div>
  );
}
