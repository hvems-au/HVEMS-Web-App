import { expect, test } from "@playwright/test";
import { COMPANY_URL, PROVIDER_URL, asAccount, basePath, currentRole, menuLinks, open, type AccountKey } from "./helpers";

/** Each role sees only the menu its permissions allow (see the test handover's access table). */
const expectMenu = (links: Set<string>, has: string[], hasNot: string[]) => {
  for (const l of has) expect(links, `menu has "${l}"`).toContain(l);
  for (const l of hasNot) expect(links, `menu hides "${l}"`).not.toContain(l);
};

const company = (key: AccountKey) => `${COMPANY_URL}${basePath(key)}`;

test.describe("Company Admin", () => {
  asAccount("companyAdmin");
  test("fleet, marketplace both sides, costs and reports", async ({ page }) => {
    await open(page, `${company("companyAdmin")}/dashboard`);
    test.skip(!/Company Admin|Owner/.test(await currentRole(page)), "This account isn't a Company Admin here; set E2E_COMPANY_ADMIN_EMAIL");
    expectMenu(await menuLinks(page), ["Equipment", "Work Orders", "Our Jobs", "Find Work", "Our Proposals", "Provider Profile", "Costs", "Reports", "Team"], []);
  });
});

test.describe("Fleet Manager", () => {
  asAccount("fleetManager");
  test("finds work but doesn't manage the provider profile", async ({ page }) => {
    await open(page, `${company("fleetManager")}/dashboard`);
    test.skip(!/Fleet Manager/.test(await currentRole(page)), "This account isn't a Fleet Manager here; set E2E_FLEET_MANAGER_EMAIL");
    expectMenu(await menuLinks(page), ["Find Work", "Our Proposals", "Costs", "Work Orders"], ["Provider Profile", "Audit History"]);
  });
});

test.describe("Technician", () => {
  asAccount("technician");
  test("sees My Jobs and never costs", async ({ page }) => {
    await open(page, `${company("technician")}/dashboard`);
    expectMenu(await menuLinks(page), ["My Jobs"], ["Costs", "Find Work", "Reports"]);
    // The costs page itself is refused, not just hidden.
    await page.goto(`${company("technician")}/costs`);
    await expect(page.getByText(/not found|could not be found|doesn.t exist/i).first()).toBeVisible();
  });
});

test.describe("Finance", () => {
  asAccount("finance");
  test("costs and reports, no marketplace quoting", async ({ page }) => {
    await open(page, `${company("finance")}/dashboard`);
    test.skip(!/Finance/.test(await currentRole(page)), "This account isn't Finance here; set E2E_FINANCE_EMAIL");
    expectMenu(await menuLinks(page), ["Costs", "Reports"], ["Find Work", "Our Proposals", "Provider Profile"]);
  });
});

test.describe("Provider Owner", () => {
  asAccount("provider");
  test("browse jobs, proposals, engagements and verification", async ({ page }) => {
    await open(page, `${PROVIDER_URL}${basePath("provider")}/dashboard`);
    expectMenu(await menuLinks(page), ["Browse Jobs", "My Proposals", "Engagements", "Profile & Verification"], ["Equipment"]);
  });
});
