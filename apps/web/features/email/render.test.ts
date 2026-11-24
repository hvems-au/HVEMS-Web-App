import { describe, expect, it } from "vitest";
import { notificationPath, portalBasePath } from "../../lib/notification-links";
import { brisbaneDateTime, renderNotificationEmail } from "./render";

const base = {
  kind: "minor_defect",
  group: "maintenance" as const,
  title: "Horn not working on EX-9",
  body: "Reported on the pre-start",
  organisationName: "Echo Earthworks",
  recipientName: "Emma",
  url: "https://portal.hvems.com.au/customer/o1/equipment/a1",
  preferencesUrl: "https://portal.hvems.com.au/account/notifications",
  sentAt: new Date("2026-11-24T22:05:00Z"),
};

describe("notification emails", () => {
  it("formats dates as dd/mm/yyyy in Brisbane time", () => {
    expect(brisbaneDateTime(new Date("2026-11-24T22:05:00Z"))).toBe("25/11/2026 8:05 am");
  });

  it("carries the title, body, link and preferences link", () => {
    const e = renderNotificationEmail(base);
    expect(e.subject).toBe("Horn not working on EX-9");
    expect(e.html).toContain(base.url);
    expect(e.html).toContain("Email preferences");
    expect(e.text).toContain(`Open in HVEMS: ${base.url}`);
    expect(e.text).toContain("25/11/2026 8:05 am");
  });

  it("marks safety alerts and leaves out the preferences link", () => {
    const e = renderNotificationEmail({ ...base, group: "safety", kind: "critical_defect", preferencesUrl: null });
    expect(e.subject).toBe("Safety alert: Horn not working on EX-9");
    expect(e.html).not.toContain("Email preferences");
    expect(e.text).toContain("always emailed");
  });

  it("escapes HTML from titles and bodies", () => {
    const e = renderNotificationEmail({ ...base, title: "<script>x</script>", body: 'a "b" & c' });
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("a &quot;b&quot; &amp; c");
  });
});

describe("notification links", () => {
  it("uses the portal base for each organisation kind", () => {
    expect(portalBasePath("provider", "p1")).toBe("/provider/p1");
    expect(portalBasePath("company", "c1")).toBe("/customer/c1");
    expect(portalBasePath("marketplace_customer", "m1")).toBe("/customer/m1");
  });

  it("opens the most specific page", () => {
    const b = "/customer/c1";
    expect(notificationPath({ kind: "marketplace_job", link_path: "jobs/j1" }, b, "x")).toBe("/customer/c1/jobs/j1");
    expect(notificationPath({ kind: "parts_approval" }, b, "x")).toBe("/customer/c1/parts?view=approval");
    expect(notificationPath({ kind: "critical_defect", inspection_id: "i1", asset_id: "a1" }, b, "x")).toBe("/customer/c1/inspections/i1");
    expect(notificationPath({ kind: "breakdown", asset_id: "a1" }, b, "x")).toBe("/customer/c1/equipment/a1");
    expect(notificationPath({ kind: "support_access_started" }, b, "/fallback")).toBe("/fallback");
  });
});
