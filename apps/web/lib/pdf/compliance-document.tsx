import type { PdfImage } from "@/lib/org-logo";
import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { RECORDS_ONLY_NOTICE } from "@hvems/domain";
import type { ComplianceSummary } from "@/features/reports/compliance";
import { C, Footer, Letterhead, registerBrandFonts, s } from "./brand";

type Section = { title: string; definition: string; lines: [string, string | number][] };

const dmy = (iso: string) => iso.split("-").reverse().join("/");

function Grid({ head, rows, widths }: { head: string[]; rows: (string | number)[][]; widths: string[] }) {
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
              {String(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Compliance summary on HVEMS letterhead, with organisation, generation time and generator (RPT-03/04). */
export function CompliancePdf({
  company,
  companyLogo,
  summary: c,
  sections,
  generated,
}: {
  company: string;
  companyLogo?: PdfImage | null;
  summary: ComplianceSummary;
  sections: Section[];
  generated: string;
}) {
  registerBrandFonts();
  return (
    <Document title={`Compliance summary ${dmy(c.from)} to ${dmy(c.to)}`} author="HVEMS">
      <Page size="A4" style={s.page}>
        <Letterhead company={company} companyLogo={companyLogo} docType="Compliance summary" reference={`${dmy(c.from)} – ${dmy(c.to)}`} />
        <Footer generated={generated} notice={RECORDS_ONLY_NOTICE} />
        <Text style={s.h1}>Compliance Summary</Text>
        <Text style={s.h1Sub}>
          {dmy(c.from)} to {dmy(c.to)}
        </Text>
        <View style={[s.section, { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }]}>
          {sections.map((sec) => (
            <View key={sec.title} wrap={false} style={{ width: "50%", paddingHorizontal: 5, marginBottom: 10 }}>
              <View style={s.card}>
                <Text style={s.h2}>{sec.title}</Text>
                {sec.lines.map(([label, value]) => (
                  <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 }}>
                    <Text style={{ color: C.muted }}>{label}</Text>
                    <Text style={{ fontWeight: 700 }}>{String(value)}</Text>
                  </View>
                ))}
                <Text style={{ fontSize: 6.8, color: C.subtle, marginTop: 5 }}>{sec.definition}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Deferred defects ({c.deferrals.length})</Text>
          {c.deferrals.length ? (
            <Grid
              head={["Deferred", "Equipment", "Defect", "New date", "Reason", "Approved by"]}
              widths={["16%", "12%", "22%", "11%", "24%", "15%"]}
              rows={c.deferrals.map((d) => [d.when, d.asset, d.defect, d.to, d.reason, d.approver])}
            />
          ) : (
            <Text style={{ color: C.muted }}>None in this period.</Text>
          )}
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Return-to-service decisions ({c.returns.length})</Text>
          {c.returns.length ? (
            <Grid
              head={["When", "Equipment", "Decided by", "Note", "Evidence"]}
              widths={["16%", "12%", "17%", "45%", "10%"]}
              rows={c.returns.map((r) => [r.when, r.asset, r.by, r.note, r.evidence])}
            />
          ) : (
            <Text style={{ color: C.muted }}>None in this period.</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
