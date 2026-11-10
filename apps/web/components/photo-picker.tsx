"use client";
import * as React from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { INSPECTION_PHOTO_BUCKET, evidencePhotoPath } from "@hvems/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Shrink large photos to at most 1600px JPEG before upload; falls back to the original file. */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))) ?? file;
  } catch {
    return file;
  }
}

type Item = { key: string; preview: string; path?: string; uploading: boolean; failed?: boolean };

/**
 * Evidence photos uploaded straight to private storage under
 * <organisation>/<asset>/<folder>/; the uploaded paths are reported through
 * onChange and re-checked by the database when the step is saved.
 */
export function PhotoPicker({
  orgId,
  assetId,
  folder,
  onChange,
  onBusyChange,
  max = 5,
  label = "Add photo",
}: {
  orgId: string;
  assetId: string;
  folder: string;
  onChange: (paths: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  max?: number;
  label?: string;
}) {
  const [items, setItems] = React.useState<Item[]>([]);
  React.useEffect(() => {
    onChange(items.filter((i) => i.path).map((i) => i.path!));
    onBusyChange?.(items.some((i) => i.uploading));
  }, [items, onChange, onBusyChange]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const db = getSupabaseBrowserClient();
    for (const file of Array.from(files).slice(0, Math.max(0, max - items.length))) {
      const key = crypto.randomUUID();
      setItems((prev) => [...prev, { key, preview: URL.createObjectURL(file), uploading: true }]);
      const body = await compressPhoto(file);
      const path = evidencePhotoPath(orgId, assetId, folder, body === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg");
      const { error } = await db.storage.from(INSPECTION_PHOTO_BUCKET).upload(path, body, { contentType: body.type || "image/jpeg" });
      setItems((prev) => prev.map((i) => (i.key === key ? { ...i, uploading: false, path: error ? undefined : path, failed: !!error } : i)));
      if (error) toast.error("A photo didn't upload. Try again.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((i) => (
        <div key={i.key} className="relative size-16 overflow-hidden rounded-[8px] border border-stroke bg-surface-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={i.preview} alt="" className={cn("size-full object-cover", i.uploading && "opacity-50")} />
          {i.uploading ? <Loader2 className="absolute inset-0 m-auto size-5 animate-spin" aria-label="Uploading" /> : null}
          {i.failed ? <span className="absolute inset-x-0 bottom-0 bg-danger px-1 text-[10px] text-white">Failed</span> : null}
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((x) => x.key !== i.key))}
            className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 shadow"
            aria-label="Remove photo"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {items.length < max ? (
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[6px] border border-stroke bg-white px-3 text-[13px] font-semibold text-ink hover:bg-surface-muted">
          <Camera className="size-4" /> {label}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
