import type { Metadata } from "next";
import { listAssetClasses } from "@hvems/api-client";
import { METER_TYPE_LABELS } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { getStaffContext } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewStandardClassForm } from "./new-class-form";

export const metadata: Metadata = { title: "Asset classes" };

const FIELD_LABELS: Record<string, string> = {
  make: "Make",
  model: "Model",
  registration_number: "Registration",
  registration_state: "State",
  vin: "VIN",
  serial_number: "Serial number",
};

/**
 * HVEMS standard asset classes (spec AST-02): every company sees them.
 * Companies can also keep their own classes (decision O-03); those stay
 * private to each company and aren't listed here.
 */
export default async function AdminAssetClassesPage() {
  const db = await createSupabaseServerClient();
  const [classes, staff] = await Promise.all([listAssetClasses(db), getStaffContext()]);
  const superAdmin = staff?.role === "platform_administrator";
  return (
    <>
      <PageHeader
        title="Asset classes"
        description="Standard classes are available to every company. Companies can also add their own classes, which only they see."
      />
      {superAdmin ? (
        <Card className="mb-5">
          <CardHeader title="Add a standard class" description="Mandatory fields follow the category: vehicles need registration and VIN, equipment a serial number." />
          <CardBody>
            <NewStandardClassForm />
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Class</TH>
              <TH>Category</TH>
              <TH>Usually measured by</TH>
              <TH>Mandatory fields</TH>
            </tr>
          </THead>
          <tbody>
            {classes.map((c) => (
              <TR key={c.id}>
                <TD className="font-semibold">{c.name}</TD>
                <TD>
                  <Badge tone={c.category === "vehicle" ? "blue" : "orange"}>{c.category}</Badge>
                </TD>
                <TD>{METER_TYPE_LABELS[c.default_meter_type]}</TD>
                <TD className="text-ink-muted">{c.required_fields.map((f) => f.split("|").map((x) => FIELD_LABELS[x] ?? x).join(" or ")).join(", ") || "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
