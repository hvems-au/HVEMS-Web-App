import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <div className="w-44">
        <Logo variant="horizontal" />
      </div>
      <h1 className="text-[22px] font-bold text-ink-muted">Page not found</h1>
      <p className="max-w-md text-[14px] text-ink-subtle">The page doesn&apos;t exist, or you don&apos;t have access to it in this organisation.</p>
      <Link href="/select-context" className="text-[14px] font-semibold text-link hover:underline">
        Go to my accounts
      </Link>
    </div>
  );
}
