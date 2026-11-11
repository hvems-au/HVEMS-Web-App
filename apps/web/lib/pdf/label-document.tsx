import type { PdfImage } from "@/lib/org-logo";
import "server-only";
import { Document, Image, Link, Page, Text, View } from "@react-pdf/renderer";
import { C, LOGO, registerBrandFonts } from "./brand";

export interface LabelData {
  company: string;
  assetNumber: string;
  description: string;
  shortCode: string;
  qrPng: string;
  /** Driver portal address, e.g. https://driver.hvems.com.au (for phones without a camera). */
  portalUrl: string;
  /** The company’s own logo as a data URI (PNG or JPEG); the company name is shown when absent. */
  companyLogo?: PdfImage | null;
}

/** 100 × 150 mm equipment label (O-10): scan, sign in, pre-start. */
export function EquipmentLabelPdf({ company, assetNumber, description, shortCode, qrPng, portalUrl, companyLogo }: LabelData) {
  registerBrandFonts();
  const mm = (n: number) => n * 2.8346;
  const portalText = portalUrl.replace(/^https?:\/\//, "");
  return (
    <Document title={`HVEMS label ${assetNumber}`} author="HVEMS" creator="HVEMS">
      <Page size={[mm(100), mm(150)]} wrap={false} style={{ fontFamily: "Montserrat", color: C.ink, padding: mm(6) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={LOGO} style={{ width: mm(34), height: mm(10) }} />
          {companyLogo ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
            <Image src={companyLogo} style={{ width: mm(40), height: mm(12), objectFit: "contain", objectPosition: "right center" }} />
          ) : (
            <Text style={{ fontSize: 7, color: C.muted, maxWidth: mm(46), textAlign: "right" }}>{company}</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", marginTop: mm(2.5) }}>
          <View style={{ height: 3, backgroundColor: C.orange, flexGrow: 1 }} />
          <View style={{ height: 3, backgroundColor: C.charcoal, width: mm(12) }} />
        </View>

        <Text style={{ marginTop: mm(3.5), fontSize: 16, fontWeight: 700, color: C.charcoal, textAlign: "center", letterSpacing: 0.5 }}>PRE-START CHECK</Text>
        <Text style={{ marginTop: mm(1), fontSize: 8, color: C.muted, textAlign: "center" }}>Scan before you operate this equipment</Text>

        <View style={{ alignItems: "center", marginTop: mm(3) }}>
          <View style={{ borderWidth: 2, borderColor: C.orange, borderRadius: 8, padding: mm(2) }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={qrPng} style={{ width: mm(52), height: mm(52) }} />
          </View>
        </View>

        <Text style={{ marginTop: mm(3), fontSize: 18, fontWeight: 700, color: C.ink, textAlign: "center" }}>{assetNumber}</Text>
        {description ? <Text style={{ fontSize: 9, color: C.muted, textAlign: "center", marginTop: 2 }}>{description}</Text> : null}

        <View style={{ marginTop: mm(3), backgroundColor: C.panel, borderRadius: 6, paddingVertical: mm(2.5), alignItems: "center" }}>
          <Text style={{ fontSize: 6.5, fontWeight: 600, color: C.subtle, letterSpacing: 1 }}>NO CAMERA? IN YOUR PHONE’S BROWSER GO TO</Text>
          <Link src={portalUrl} style={{ fontSize: 10.5, fontWeight: 700, color: C.orange, marginTop: 2, textDecoration: "none" }}>
            {portalText}
          </Link>
          <Text style={{ fontSize: 6.5, fontWeight: 600, color: C.subtle, letterSpacing: 1, marginTop: mm(1.5) }}>AND TYPE THIS CODE</Text>
          <Text style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, letterSpacing: 2, marginTop: 2 }}>{shortCode}</Text>
        </View>

        <Text style={{ marginTop: mm(2.5), fontSize: 7.5, color: C.ink, textAlign: "center" }}>Sign in with your Driver ID and PIN. Every check is recorded with your name.</Text>
        <View style={{ marginTop: mm(2.5), backgroundColor: C.redSoft, borderRadius: 4, paddingVertical: 4 }}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: C.red, textAlign: "center" }}>If anyone is injured or in danger, call 000 first.</Text>
        </View>
      </Page>
    </Document>
  );
}
