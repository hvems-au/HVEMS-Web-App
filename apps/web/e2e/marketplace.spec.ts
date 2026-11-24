import { expect, test } from "@playwright/test";
import { COMPANY_URL, PROVIDER_URL, asAccount, basePath, expectHealthy, open } from "./helpers";

/**
 * Marketplace privacy and the company's two sides, read-only, using the development sample jobs
 * (scripts/db/seed-marketplace-*.sql).
 */
test.describe("marketplace as a provider", () => {
  asAccount("provider");

  test("open jobs never show the private address before an engagement", async ({ page }) => {
    await open(page, `${PROVIDER_URL}${basePath("provider")}/jobs`);
    const job = page.getByRole("link", { name: "Truck losing power on hills" });
    test.skip((await job.count()) === 0, "Sample jobs not loaded (run scripts/db/seed-marketplace-sample-jobs.sql).");
    await job.first().click();
    await expectHealthy(page);
    await expect(page.getByText("Caloundra").first()).toBeVisible();
    await expect(page.getByText(/Sample Street/)).toHaveCount(0);
    await expect(page.getByText(/exact address is shared once an engagement is confirmed/i)).toBeVisible();
  });

  test("proposals have their own page with filters", async ({ page }) => {
    await open(page, `${PROVIDER_URL}${basePath("provider")}/proposals`);
    await expect(page.getByRole("heading", { name: "My proposals" })).toBeVisible();
    await expect(page.getByLabel(/search/i).or(page.getByPlaceholder(/job, suburb/i)).first()).toBeVisible();
  });
});

test.describe("marketplace as a company", () => {
  asAccount("companyAdmin");

  test("a company never sees its own jobs under Find work", async ({ page }) => {
    const base = `${COMPANY_URL}${basePath("companyAdmin")}`;
    await open(page, `${base}/marketplace`);
    const own = page.getByRole("link", { name: "Hour-meter service on the backhoe" });
    test.skip((await own.count()) === 0, "Sample jobs not loaded (run scripts/db/seed-marketplace-sample-jobs.sql).");
    await open(page, `${base}/jobs`);
    await expect(page.getByRole("link", { name: "Hour-meter service on the backhoe" })).toHaveCount(0);
  });
});
