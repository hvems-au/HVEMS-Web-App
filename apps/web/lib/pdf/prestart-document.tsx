import "server-only";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { DEFECT_SEVERITY_LABELS, DEFECT_STATUS_LABELS, INSPECTION_RESULT_LABELS, RECORDS_ONLY_NOTICE, formatDateTimeAU } from "@hvems/domain";
import type { Defect, Inspection, InspectionAnswer } from "@hvems/types";
import { C, Chip, Field, Footer, Letterhead, registerBrandFonts, s } from "./brand";

export interface PrestartPdfData {
  company: string;
  timezone: string;
  inspection: Inspection;
  answers: InspectionAnswer[];
  defects: Defect[];
  /** Photos already fetched as image data (PNG/JPEG only), keyed by item code ("" = general). */
  photos: { itemCode: string; data: Buffer }[];
  generatedAt: Date;
}

const RESULT_STYLE = {
  pass: { fg: C.green, bg: C.greenSoft, line: "No faults recorded." },
  pass_with_faults: { fg: C.amber, bg: C.amberSoft, line: "Faults recorded. Follow the company's procedure." },
  fail: { fg: C.red, bg: C.redSoft, line: "Do not operate. The equipment was taken out of service or the operator was not fit." },
} as const;
const SEVERITY_STYLE = { critical: { fg: C.red, bg: C.redSoft }, minor: { fg: C.amber, bg: C.amberSoft }, advisory: { fg: C.muted, bg: C.panel } } as const;
const ANSWER_STYLE = { ok: { t: "OK", fg: C.green, bg: C.greenSoft }, fault: { t: "FAULT", fg: C.red, bg: C.redSoft }, na: { t: "N/A", fg: C.muted, bg: C.panel } } as const;

const num = (n: number | null, d = 1) => (n === null ? null : new Intl.NumberFormat("en-AU", { maximumFractionDigits: d }).format(n));

/** A submitted pre-start on HVEMS letterhead. */
export function PrestartPdf({ company, timezone, inspection: i, answers, defects, photos, generatedAt }: PrestartPdfData) {
  registerBrandFonts();
  const h = i.header;
  const ref = `PS-${i.id.slice(0, 8).toUpperCase()}`;
  const when = formatDateTimeAU(new Date(i.submitted_at), timezone);
  const result = RESULT_STYLE[i.result];
  const faults = answers.filter((a) => a.answer === "fault");
  const sections = answers.reduce<{ name: string; items: InspectionAnswer[] }[]>((acc, a) => {
    const last = acc[acc.length - 1];
    if (last && last.name === a.template_name) last.items.push(a);
    else acc.push({ name: a.template_name, items: [a] });
    return acc;
  }, []);
  const photosFor = (code: string) => photos.filter((p) => p.itemCode === code);
  const okCount = answers.filter((a) => a.answer === "ok").length;
  const naCount = answers.filter((a) => a.answer === "na").length;

  return (
    <Document title={`Pre-start ${h.asset_number} ${when}`} author="HVEMS" subject="Pre-start inspection record" creator="HVEMS">
      <Page size="A4" style={s.page}>
        <Letterhead company={company} docType="Pre-start inspection record" reference={ref} />
        <Footer generated={`Generated ${formatDateTimeAU(generatedAt, timezone)}`} notice={RECORDS_ONLY_NOTICE} />

        {/* Title */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={s.h1}>Pre-start Inspection</Text>
            <Text style={s.h1Sub}>
              {h.asset_number}
              {h.make || h.model ? ` · ${[h.make, h.model].filter(Boolean).join(" ")}` : ""} · {when}
            </Text>
          </View>
          <Chip text={INSPECTION_RESULT_LABELS[i.result].toUpperCase()} color={result.fg} background={result.bg} />
        </View>

        {/* Outcome banner */}
        <View style={{ marginTop: 12, borderRadius: 6, backgroundColor: result.bg, borderLeftWidth: 4, borderLeftColor: result.fg, padding: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: 700, color: result.fg }}>{INSPECTION_RESULT_LABELS[i.result]}</Text>
          <Text style={{ fontSize: 8.5, color: C.ink, marginTop: 2 }}>
            {i.operator_fault ? "The operator reported they were not fit or not licensed for this equipment." : result.line}{" "}
            {answers.length} items checked: {okCount} OK, {faults.length} fault{faults.length === 1 ? "" : "s"}, {naCount} N/A.
          </Text>
        </View>

        {/* Equipment */}
        <View style={s.section}>
          <Text style={s.h2}>Equipment</Text>
          <View style={[s.card, { flexDirection: "row", flexWrap: "wrap", paddingBottom: 2 }]}>
            <Field label="Equipment ID" value={h.asset_number} />
            <Field label="Class" value={h.asset_class ?? ""} />
            <Field label="Make / Model" value={[h.make, h.model].filter(Boolean).join(" ")} />
            <Field label="Year" value={h.year ? String(h.year) : ""} />
            <Field label="Rego" value={h.registration_number ? `${h.registration_number} ${h.registration_state ?? ""}`.trim() : ""} />
            <Field label="VIN / Serial" value={h.vin ?? h.serial_number ?? ""} />
            {i.odometer_km !== null ? (
              <Field label="Odometer reading" value={`${num(i.odometer_km)} km${h.last_odometer_km !== null ? `  (previous ${num(h.last_odometer_km)} km)` : ""}`} />
            ) : null}
            {i.engine_hours !== null ? (
              <Field label="Hour meter reading" value={`${num(i.engine_hours)} hours${h.last_engine_hours !== null ? `  (previous ${num(h.last_engine_hours)})` : ""}`} />
            ) : null}
            <Field label="Checklist" value={i.templates.map((t) => `${t.name} v${t.version}`).join(", ")} />
          </View>
        </View>

        {/* Faults */}
        {faults.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Faults ({faults.length})</Text>
            {faults.map((a) => {
              const sev = SEVERITY_STYLE[a.severity];
              const pics = photosFor(a.item_code);
              return (
                <View key={a.id} wrap={false} style={[s.card, { marginBottom: 6, borderLeftWidth: 3, borderLeftColor: a.operator_item ? C.blue : sev.fg }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 9.5, fontWeight: 600, width: "80%" }}>
                      <Text style={{ color: C.subtle }}>{a.item_code}  </Text>
                      {a.prompt}
                    </Text>
                    {a.operator_item ? (
                      <Chip text="OPERATOR" color={C.blue} background={C.blueSoft} />
                    ) : (
                      <Chip text={DEFECT_SEVERITY_LABELS[a.severity].toUpperCase()} color={sev.fg} background={sev.bg} />
                    )}
                  </View>
                  {a.note ? <Text style={{ marginTop: 4, color: C.muted, fontStyle: "normal" }}>“{a.note}”</Text> : null}
                  {pics.length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                      {pics.map((p, n) => (
                        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                        <Image key={n} src={p.data} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 4, marginRight: 6, marginBottom: 6 }} />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {defects.length ? (
              <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                Defects raised from this pre-start (current status): {defects.map((d) => `${d.title}: ${DEFECT_SEVERITY_LABELS[d.severity]}, ${DEFECT_STATUS_LABELS[d.status]}`).join("; ")}.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* All answers */}
        <View style={s.section}>
          <Text style={s.h2}>Checklist</Text>
          {sections.map((sec) => (
            <View key={sec.name} style={{ marginBottom: 8 }}>
              <View style={{ backgroundColor: C.charcoal, paddingVertical: 4, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
                <Text style={{ color: "#FFFFFF", fontSize: 8, fontWeight: 700, letterSpacing: 0.8 }}>{sec.name.toUpperCase()}</Text>
              </View>
              {sec.items.map((a, n) => {
                const st = ANSWER_STYLE[a.answer];
                return (
                  <View
                    key={a.id}
                    wrap={false}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 3.5,
                      paddingHorizontal: 8,
                      backgroundColor: n % 2 ? C.panel : "#FFFFFF",
                      borderBottomWidth: 0.5,
                      borderBottomColor: C.line,
                    }}
                  >
                    <Text style={{ width: 34, fontSize: 7.5, color: C.subtle, fontWeight: 600 }}>{a.item_code}</Text>
                    <Text style={{ flex: 1, fontSize: 8.3, paddingRight: 8 }}>{a.prompt}</Text>
                    <Chip text={st.t} color={st.fg} background={st.bg} />
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Notes and general photos */}
        {i.notes || photosFor("").length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Notes</Text>
            <View style={s.card}>
              {i.notes ? <Text>{i.notes}</Text> : null}
              {photosFor("").length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: i.notes ? 6 : 0 }}>
                  {photosFor("").map((p, n) => (
                    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                    <Image key={n} src={p.data} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 4, marginRight: 6, marginBottom: 6 }} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Declaration */}
        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Declaration</Text>
          <View style={[s.card, { flexDirection: "row", justifyContent: "space-between" }]}>
            <View style={{ width: "62%" }}>
              <Text style={{ color: C.muted }}>“I have completed this check honestly. Faults I found are recorded above.”</Text>
              <Text style={{ marginTop: 6, fontSize: 7.5, color: C.subtle }}>Signed electronically in HVEMS when the pre-start was submitted. This record cannot be changed.</Text>
            </View>
            <View style={{ width: "34%", borderLeftWidth: 0.75, borderLeftColor: C.line, paddingLeft: 10 }}>
              <Text style={s.label}>Operator</Text>
              <Text style={{ fontSize: 11, fontWeight: 700, color: C.charcoal, marginTop: 2 }}>{h.operator_name ?? "—"}</Text>
              <Text style={[s.label, { marginTop: 6 }]}>Signed</Text>
              <Text style={s.value}>{when}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
