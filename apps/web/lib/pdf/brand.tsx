import type { PdfImage } from "@/lib/org-logo";
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * HVEMS letterhead for generated PDF records (brand guidelines v1.0:
 * Montserrat, Orange #CE5502, Charcoal #444444). Fonts and the logo are read
 * from disk; next.config traces them into the PDF routes.
 */
const root = process.cwd();
// Loaded into memory as data URIs: a Windows path like D:\… is otherwise taken for a URL.
const font = (weight: number) =>
  `data:font/woff;base64,${readFileSync(path.join(root, "node_modules/@fontsource/montserrat/files", `montserrat-latin-${weight}-normal.woff`)).toString("base64")}`;

let registered = false;
export function registerBrandFonts() {
  if (registered) return;
  Font.register({
    family: "Montserrat",
    fonts: [
      { src: font(400), fontWeight: 400 },
      { src: font(500), fontWeight: 500 },
      { src: font(600), fontWeight: 600 },
      { src: font(700), fontWeight: 700 },
    ],
  });
  // Keep words whole: no automatic hyphenation in records.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export const LOGO = { data: readFileSync(path.join(root, "lib/pdf/assets/hvems-logo-horizontal.png")), format: "png" as const };

export const C = {
  orange: "#CE5502",
  orangeSoft: "#FDEEE3",
  charcoal: "#444444",
  ink: "#2B2B2B",
  muted: "#6B6B6B",
  subtle: "#9A9A9A",
  line: "#E3E3E3",
  panel: "#F6F6F6",
  green: "#0A7A00",
  greenSoft: "#E6F6E5",
  amber: "#9A4A00",
  amberSoft: "#FFF1DE",
  red: "#C40F10",
  redSoft: "#FDE6E6",
  blue: "#1C5FBD",
  blueSoft: "#E8F0FC",
};

export const s = StyleSheet.create({
  page: { fontFamily: "Montserrat", fontSize: 9, color: C.ink, paddingTop: 92, paddingBottom: 64, paddingHorizontal: 40, lineHeight: 1.35 },
  header: { position: "absolute", top: 26, left: 40, right: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 128, height: 38 },
  headerRight: { alignItems: "flex-end" },
  company: { fontSize: 11, fontWeight: 700, color: C.charcoal },
  docType: { fontSize: 7.5, fontWeight: 600, color: C.orange, letterSpacing: 1.2, marginTop: 2 },
  ref: { fontSize: 7.5, color: C.muted, marginTop: 2 },
  rule: { flexDirection: "row", marginTop: 10 },
  ruleOrange: { height: 3, backgroundColor: C.orange, flexGrow: 1 },
  ruleCharcoal: { height: 3, backgroundColor: C.charcoal, width: 60 },
  // A4 is 841.9pt tall; the footer is placed from the top (a bottom offset is unreliable in react-pdf).
  footer: { position: "absolute", top: 790, left: 40, right: 40, borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 6 },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 6.8, color: C.subtle },
  h1: { fontSize: 20, fontWeight: 700, color: C.charcoal, lineHeight: 1.2 },
  h1Sub: { fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.3 },
  h2: { fontSize: 10.5, fontWeight: 700, color: C.charcoal, marginBottom: 6 },
  section: { marginTop: 16 },
  label: { fontSize: 6.8, fontWeight: 600, color: C.subtle, letterSpacing: 0.8, textTransform: "uppercase" },
  value: { fontSize: 9.5, color: C.ink, marginTop: 1.5 },
  card: { borderWidth: 0.75, borderColor: C.line, borderRadius: 6, padding: 10 },
  chip: { fontSize: 7, fontWeight: 700, paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },
});

export function Letterhead({ company, companyLogo, docType, reference }: { company: string; companyLogo?: PdfImage | null; docType: string; reference: string }) {
  return (
    <View style={s.header} fixed>
      <View style={s.headerRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        <Image src={LOGO} style={s.logo} />
        {/* The company's logo sits beside its details, so the header keeps its height. */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {companyLogo ? (
            <View style={{ paddingRight: 10, marginRight: 10, borderRightWidth: 1, borderRightColor: C.line }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={companyLogo} style={{ width: 110, height: 38, objectFit: "contain", objectPosition: "right center" }} />
            </View>
          ) : null}
          <View style={s.headerRight}>
            <Text style={s.company}>{company}</Text>
            <Text style={s.docType}>{docType.toUpperCase()}</Text>
            <Text style={s.ref}>{reference}</Text>
          </View>
        </View>
      </View>
      <View style={s.rule}>
        <View style={s.ruleOrange} />
        <View style={s.ruleCharcoal} />
      </View>
    </View>
  );
}

export function Footer({ generated, notice }: { generated: string; notice: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={[s.footerText, { marginBottom: 3 }]}>{notice}</Text>
      <View style={s.footerRow}>
        <Text style={s.footerText}>HVEMS · Heavy Vehicle &amp; Equipment Management System · {generated}</Text>
        <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </View>
  );
}

export function Field({ label, value, width = "33.33%" }: { label: string; value: string; width?: string }) {
  return (
    <View style={{ width, paddingRight: 8, marginBottom: 8 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || "—"}</Text>
    </View>
  );
}

export function Chip({ text, color, background }: { text: string; color: string; background: string }) {
  return <Text style={[s.chip, { color, backgroundColor: background }]}>{text}</Text>;
}
