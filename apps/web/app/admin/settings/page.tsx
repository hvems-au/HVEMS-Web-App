import type { Metadata } from "next";
import { getPersonNames, listPlatformSettings } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { SettingEditor } from "@/features/admin/setting-editor";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform settings" };

const TONE = { confirmed: "green", recommended: "blue", to_be_confirmed: "amber", specialist_review: "orange" } as const;

type Change = { id: number; key: string; old_value: unknown; new_value: unknown; reason: string; changed_by: string | null; changed_at: string };

/** Prices, limits and time windows HVEMS changes without development (SoW §12.5, ADM-08), with the history of every change. */
export default async function AdminSettingsPage() {
  const db = await createSupabaseServerClient();
  const admin = (await getStaffContext())?.role === "platform_administrator";
  const [settings, changes] = await Promise.all([
    listPlatformSettings(db),
    db.from("platform_setting_changes" as never).select("*").order("changed_at", { ascending: false }).limit(50) as unknown as Promise<{ data: Change[] | null }>,
  ]);
  const history = changes.data ?? [];
  const names = await getPersonNames(db, history.map((c) => c.changed_by));

  return (
    <>
      <PageHeader
        title="Platform settings"
        description={
          admin
            ? "Prices, limits and time windows HVEMS can change without development. Each change needs a reason and is kept in the history below."
            : "Prices, limits and time windows. Only a Platform Administrator can change them."
        }
      />
      <Card className="mb-5">
        <Table>
          <THead>
            <tr>
              <TH>Setting</TH>
              <TH>Value</TH>
              <TH>Status</TH>
              <TH>Scope</TH>
              {admin ? <TH className="w-12" /> : null}
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
                {admin ? (
                  <TD>
                    <SettingEditor settingKey={s.key} description={s.description} value={s.value} />
                  </TD>
                ) : null}
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Change history" description="Who changed what, when and why (latest 50)" />
        <CardBody className="pt-0">
          {history.length === 0 ? (
            <p className="text-[14px] text-ink-muted">No changes yet.</p>
          ) : (
            <ul className="divide-y divide-stroke text-[14px]">
              {history.map((c) => (
                <li key={c.id} className="py-2.5">
                  <span className="font-mono text-[12.5px]">{c.key}</span>: {JSON.stringify(c.old_value)} → <span className="font-semibold">{JSON.stringify(c.new_value)}</span>
                  <span className="block text-[12.5px] text-ink-muted">
                    {names.get(c.changed_by ?? "") ?? "—"}, {formatDateTimeAU(new Date(c.changed_at))}: {c.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
