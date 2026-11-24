import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { ACCOUNTS, COMPANY_URL, PROVIDER_URL, authFile, basePathFile, requireCredentials, signIn, type AccountKey } from "./helpers";

/** Sign each test account in once through the real form and keep the session for the specs. */
const PORTAL: Record<AccountKey, string> = {
  companyAdmin: COMPANY_URL,
  fleetManager: COMPANY_URL,
  technician: COMPANY_URL,
  finance: COMPANY_URL,
  provider: PROVIDER_URL,
};

for (const key of Object.keys(ACCOUNTS) as AccountKey[]) {
  setup(`sign in: ${key}`, async ({ page }) => {
    requireCredentials();
    const base = await signIn(page, PORTAL[key], ACCOUNTS[key]);
    await page.context().storageState({ path: authFile(key) });
    fs.writeFileSync(basePathFile(key), base);
  });
}
