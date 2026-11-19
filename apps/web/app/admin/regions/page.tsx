import type { Metadata } from "next";
import { listMarketplaceRegions } from "@hvems/api-client";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { RegionToggle } from "@/features/marketplace/region-toggle";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Marketplace regions" };

/** Which regions take marketplace jobs (MKT-25). Opening one needs no deployment. */
export default async function RegionsPage() {
  const staff = await getStaffContext();
  const db = await createSupabaseServerClient();
  const [regions, interest] = await Promise.all([
    listMarketplaceRegions(db),
    db.from("region_interest").select("id, suburb, postcode, note, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const admin = staff?.role === "platform_administrator";

  return (
    <>
      <PageHeader title="Marketplace regions" description="Posters can only post jobs in open regions. Fleet management works everywhere." />
      <Card className="mb-5">
        <Table>
          <THead>
            <tr>
              <TH>Region</TH>
              <TH>State</TH>
              <TH>Open for jobs</TH>
            </tr>
          </THead>
          <tbody>
            {regions.map((r) => (
              <TR key={r.code}>
                <TD className="font-medium">{r.name}</TD>
                <TD>{r.state}</TD>
                <TD>
                  <RegionToggle code={r.code} name={r.name} open={r.open} disabled={!admin} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Interest from other areas" description="Posters outside open regions who asked to be told" />
        <CardBody className="pt-0">
          {(interest.data ?? []).length === 0 ? (
            <p className="text-[14px] text-ink-muted">None yet.</p>
          ) : (
            <ul className="divide-y divide-stroke text-[14px]">
              {(interest.data ?? []).map((i) => (
                <li key={i.id} className="py-2">
                  <span className="font-medium">
                    {i.suburb}
                    {i.postcode ? ` ${i.postcode}` : ""}
                  </span>
                  {i.note ? <span className="text-ink-muted"> · {i.note}</span> : null}
                  <span className="block text-[12.5px] text-ink-subtle">{formatDateTimeAU(new Date(i.created_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
