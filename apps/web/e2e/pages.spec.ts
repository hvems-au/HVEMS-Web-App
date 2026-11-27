import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { COMPANY_URL, PROVIDER_URL, asAccount, basePath, open } from "./helpers";

const COMPANY_PAGES = [
  "dashboard", "equipment", "inspections", "defects", "notifications", "maintenance", "work-orders", "technicians",
  "parts", "fuel", "costs", "documents", "reports", "reports/asset-register", "reports/marketplace",
  "reports/compliance", "marketplace", "jobs", "proposals", "engagements", "verification", "team", "settings",
];
const PROVIDER_PAGES = ["dashboard", "jobs", "proposals", "engagements", "verification", "settings"];
const AXE_PAGES = ["dashboard", "equipment", "defects", "work-orders", "marketplace", "jobs", "reports"];

/** Every main page opens without the error screen (smoke regression). */
test.describe("company portal, as Company Admin", () => {
  asAccount("companyAdmin");

  for (const p of COMPANY_PAGES) {
    test(`opens: ${p}`, async ({ page }) => {
      await open(page, `${COMPANY_URL}${basePath("companyAdmin")}/${p}`);
    });
  }

  /** WCAG 2.2 AA spot checks on critical journeys: no critical accessibility problems. */
  for (const p of AXE_PAGES) {
    test(`no critical accessibility issues: ${p}`, async ({ page }) => {
      await open(page, `${COMPANY_URL}${basePath("companyAdmin")}/${p}`);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const critical = results.violations.filter((v) => v.impact === "critical");
      expect(critical.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`), "critical accessibility issues").toEqual([]);
    });
  }

  test("@phone dashboard works at phone width", async ({ page }) => {
    await open(page, `${COMPANY_URL}${basePath("companyAdmin")}/dashboard`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no sideways scrolling").toBeLessThanOrEqual(1);
  });
});

test.describe("provider portal, as Provider Owner", () => {
  asAccount("provider");

  for (const p of PROVIDER_PAGES) {
    test(`opens: ${p}`, async ({ page }) => {
      await open(page, `${PROVIDER_URL}${basePath("provider")}/${p}`);
    });
  }
});
