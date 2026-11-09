import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { Card, EmptyState } from "@/components/ui/primitives";
import { MODULE_INFO } from "@/lib/navigation";

/**
 * Honest placeholder for Stage 2 modules not yet built. Shows scope and
 * increment instead of mock data (brief §23: no static data disguising
 * unfinished backend functionality).
 */
export function ModulePlaceholder({ module }: { module: string }) {
  const info = MODULE_INFO[module];
  if (!info) notFound();
  return (
    <>
      <PageHeader title={info.title} description={`Scope ${info.sow}`} />
      <Card>
        <EmptyState icon={<Construction />} title={`Delivered in increment ${info.increment}`}>
          <p>{info.scope}</p>
          <p className="mt-2 text-[13px] text-ink-subtle">
            Stage 2 is built in four increments (2A foundations, 2B safety, 2C maintenance, 2D marketplace and billing). This screen goes live
            with its increment and will be demonstrated before acceptance.
          </p>
        </EmptyState>
      </Card>
    </>
  );
}
