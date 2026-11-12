"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { QrScanButton } from "./qr-scan";

/**
 * Scan QR first (quickest on site), then a search that updates the list as you
 * type (short pause after the last key; no Enter needed). The URL keeps the
 * search, so Back and refresh show the same results.
 */
export function OperatorEquipmentSearch({
  purpose,
  q,
  cls,
  classes,
}: {
  purpose: "prestart" | "issue" | null;
  q: string;
  cls: string;
  classes: [string, string][];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = React.useTransition();
  const [text, setText] = React.useState(q);
  const [type, setType] = React.useState(cls);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const go = React.useCallback(
    (nextQ: string, nextCls: string) => {
      const sp = new URLSearchParams();
      if (purpose) sp.set("for", purpose);
      if (nextQ.trim()) sp.set("q", nextQ.trim());
      if (nextCls) sp.set("class", nextCls);
      const qs = sp.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, purpose, router],
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="mb-4 flex flex-col gap-3">
      <QrScanButton searchPath={`${pathname}${purpose ? `?for=${purpose}` : ""}`} />
      <div className="flex items-center gap-3 text-[12.5px] font-medium text-ink-subtle" aria-hidden>
        <span className="h-px flex-1 bg-stroke" />
        or search
        <span className="h-px flex-1 bg-stroke" />
      </div>
      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          clearTimeout(timer.current);
          go(text, type);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            name="q"
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => go(v, type), 300);
            }}
            placeholder="Rego, equipment ID, make, model or QR code"
            aria-label="Search vehicles and equipment"
            className="h-12 pr-10 pl-10 text-[16px]"
            autoComplete="off"
            enterKeyHint="search"
          />
          {pending ? <Loader2 className="absolute top-1/2 right-3 size-[18px] -translate-y-1/2 animate-spin text-ink-subtle" aria-label="Searching" /> : null}
        </div>
        {classes.length > 1 ? (
          <Select
            name="class"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              clearTimeout(timer.current);
              go(text, e.target.value);
            }}
            aria-label="Type"
            className="h-12 sm:w-56"
          >
            <option value="">All types</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        ) : null}
      </form>
    </div>
  );
}
