import type { Metadata } from "next";
import { listPlatformSettings } from "@hvems/api-client";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform settings" };

const TONE = { confirmed: "green", recommended: "blue", to_be_confirmed: "amber", specialist_review: "orange" } as const;

export default async function AdminSettingsPage() {
  const db = await createSupabaseServerClient();
  const settings = await listPlatformSettings(db);
  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Prices, limits and time windows HVEMS can change without development (SoW §12.5). Editing with second approval arrives in increment 2D."
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Setting</TH>
              <TH>Value</TH>
              <TH>Status</TH>
              <TH>Scope</TH>
            </tr>
          </THead>
          <tbody>
            {settings.map((s) => (
              <TR key={s.key}>
                <TD>
                  <p className="font-mono text-[12px] text-ink">{s.key}</p>
                  <p className="text-[12.5px] text-ink-muted">{s.description}</p>
                </TD>
                <TD className="font-mono">{JSON.stringify(s.value)}</TD>
                <TD>
                  <Badge tone={TONE[s.status]}>{s.status.replaceAll("_", " ")}</Badge>
                </TD>
                <TD className="whitespace-nowrap">{s.sow_reference}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
