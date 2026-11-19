import type { PdfImage } from "@/lib/org-logo";
import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { RECORDS_ONLY_NOTICE } from "@hvems/domain";
import { C, Field, Footer, Letterhead, registerBrandFonts, s } from "./brand";

export type WoPdfData = {
  company: string;
  companyLogo?: PdfImage | null;
  generated: string;
  number: string;
  title: string;
  status: string;
  fields: [string, string][];
  description: string | null;
  completion: string | null;
  reports: { title: string; when: string; by: string; checks: [string, string][]; notes: string; readings: string }[];
  parts: [string, string, string][];
  files: [string, string, string][];
  /** Only for people who can see costs. */
  costs: { lines: [string, string, string][]; total: string } | null;
};

function Rows({ head, rows, widths }: { head: string[]; rows: string[][]; widths: string[] }) {
  return (
    <View style={{ borderWidth: 0.75, borderColor: C.line, borderRadius: 6 }}>
      <View style={{ flexDirection: "row", backgroundColor: C.panel, paddingVertical: 4, paddingHorizontal: 6 }}>
        {head.map((h, i) => (
          <Text key={h} style={[s.label, { width: widths[i] }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, n) => (
        <View key={n} wrap={false} style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 0.5, borderTopColor: C.line }}>
          {r.map((c, i) => (
            <Text key={i} style={{ width: widths[i], fontSize: 8, paddingRight: 4 }}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** A work order on HVEMS letterhead (RPT-04): details, pre/post-work reports, parts, files and (for cost readers) costs. */
export function WorkOrderPdf(d: WoPdfData) {
  registerBrandFonts();
  return (
    <Document title={`${d.number} ${d.title}`} author="HVEMS">
      <Page size="A4" style={s.page}>
        <Letterhead company={d.company} companyLogo={d.companyLogo} docType="Work order" reference={d.number} />
        <Footer generated={d.generated} notice={RECORDS_ONLY_NOTICE} />
        <Text style={s.h1}>{d.title}</Text>
        <Text style={s.h1Sub}>
          {d.number} · {d.status}
        </Text>
        <View style={[s.section, s.card, { flexDirection: "row", flexWrap: "wrap", paddingBottom: 2 }]}>
          {d.fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </View>
        {d.description ? (
          <View style={s.section}>
            <Text style={s.h2}>Work requested</Text>
            <Text>{d.description}</Text>
          </View>
        ) : null}
        {d.reports.map((r) => (
          <View key={r.title} style={s.section} wrap={false}>
            <Text style={s.h2}>{r.title}</Text>
            <View style={s.card}>
              <Text style={{ color: C.muted, marginBottom: 4 }}>
                {r.when} · {r.by}
                {r.readings ? ` · ${r.readings}` : ""}
              </Text>
              {r.checks.map(([label, answer]) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 }}>
                  <Text>{label}</Text>
                  <Text style={{ fontWeight: 700, color: answer === "Issue" ? C.red : answer === "OK" ? C.green : C.muted }}>{answer}</Text>
                </View>
              ))}
              {r.notes ? <Text style={{ marginTop: 5 }}>{r.notes}</Text> : null}
            </View>
          </View>
        ))}
        {d.completion ? (
          <View style={s.section}>
            <Text style={s.h2}>Completion notes</Text>
            <Text>{d.completion}</Text>
          </View>
        ) : null}
        {d.parts.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Parts used</Text>
            <Rows head={["Part", "Quantity", "Fitted or returned"]} widths={["60%", "15%", "25%"]} rows={d.parts} />
          </View>
        ) : null}
        {d.files.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Invoices and documents</Text>
            <Rows head={["File", "Type", "Supplier / reference"]} widths={["50%", "15%", "35%"]} rows={d.files} />
          </View>
        ) : null}
        {d.costs ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Costs</Text>
            {d.costs.lines.length ? (
              <Rows head={["Type", "Description", "Amount"]} widths={["18%", "62%", "20%"]} rows={d.costs.lines} />
            ) : (
              <Text style={{ color: C.muted }}>No costs posted yet (labour and other costs post when the work order is closed).</Text>
            )}
            <Text style={{ marginTop: 6, fontWeight: 700, textAlign: "right" }}>Total {d.costs.total}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
