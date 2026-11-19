import type { PdfImage } from "@/lib/org-logo";
import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { RECORDS_ONLY_NOTICE } from "@hvems/domain";
import { C, Field, Footer, Letterhead, registerBrandFonts, s } from "./brand";

export type ServicePackData = {
  company: string;
  companyLogo?: PdfImage | null;
  generated: string;
  assetNumber: string;
  heading: string;
  condition: string;
  fields: [string, string][];
  plans: string[][];
  services: string[][];
  defects: string[][];
  documents: string[][];
};

function Rows({ head, rows, widths, empty }: { head: string[]; rows: string[][]; widths: string[]; empty: string }) {
  if (!rows.length) return <Text style={{ color: C.muted }}>{empty}</Text>;
  return (
    <View style={{ borderWidth: 0.75, borderColor: C.line, borderRadius: 6 }}>
      <View style={{ flexDirection: "row", backgroundColor: C.panel, paddingVertical: 4, paddingHorizontal: 6 }} fixed>
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

/** Service history pack for one piece of equipment (RPT-04): details, plans, services done, defects and documents. */
export function ServiceHistoryPdf(d: ServicePackData) {
  registerBrandFonts();
  return (
    <Document title={`Service history ${d.assetNumber}`} author="HVEMS">
      <Page size="A4" style={s.page}>
        <Letterhead company={d.company} companyLogo={d.companyLogo} docType="Service history pack" reference={d.assetNumber} />
        <Footer generated={d.generated} notice={RECORDS_ONLY_NOTICE} />
        <Text style={s.h1}>{d.heading}</Text>
        <Text style={s.h1Sub}>
          {d.assetNumber} · {d.condition}
        </Text>
        <View style={[s.section, s.card, { flexDirection: "row", flexWrap: "wrap", paddingBottom: 2 }]}>
          {d.fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Service plans</Text>
          <Rows
            head={["Plan", "Interval", "Last done", "Next due", "Status"]}
            widths={["24%", "22%", "18%", "24%", "12%"]}
            rows={d.plans}
            empty="No service plans."
          />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Work done ({d.services.length})</Text>
          <Rows
            head={["Closed", "Work order", "Work", "Done by", "Readings"]}
            widths={["13%", "12%", "37%", "18%", "20%"]}
            rows={d.services}
            empty="No closed work orders."
          />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Defects ({d.defects.length})</Text>
          <Rows
            head={["Reported", "Defect", "Severity", "Status", "Closed"]}
            widths={["14%", "44%", "12%", "16%", "14%"]}
            rows={d.defects}
            empty="No defects recorded."
          />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Documents ({d.documents.length})</Text>
          <Rows head={["Document", "Type", "Expires"]} widths={["60%", "22%", "18%"]} rows={d.documents} empty="No documents." />
        </View>
      </Page>
    </Document>
  );
}
