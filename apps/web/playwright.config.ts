import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running HVEMS web app (local dev server or the development site).
 * They only read: the setup project signs each development test account in once (e2e/auth.setup.ts),
 * then the specs reuse those sessions to check what each role sees.
 *
 *   E2E_PASSWORD=...            the development test accounts' password (never committed)
 *   E2E_COMPANY_URL=...         default http://company.localhost:3000
 *   E2E_PROVIDER_URL=...        default http://provider.localhost:3000
 *   E2E_<ROLE>_EMAIL=...        override an account (see e2e/helpers.ts)
 *
 * Run: corepack pnpm --filter @hvems/web e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-AU",
    timezoneId: "Australia/Brisbane",
    navigationTimeout: 120_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, dependencies: ["setup"], grep: /@phone/ },
  ],
});
