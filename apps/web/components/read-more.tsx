import { cn } from "@/lib/utils";

/** A short line of text, with the details tucked behind "Read more" (no JavaScript needed). */
export function ReadMore({ summary, children, className }: { summary: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group text-[13px] text-ink-muted", className)}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {summary}{" "}
        <span className="font-medium text-link group-open:hidden">Read more</span>
        <span className="hidden font-medium text-link group-open:inline">Show less</span>
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}
