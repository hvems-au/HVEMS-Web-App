import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

export const COMPANY_URL = process.env.E2E_COMPANY_URL ?? "http://company.localhost:3000";
export const PROVIDER_URL = process.env.E2E_PROVIDER_URL ?? "http://provider.localhost:3000";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

/** Development test accounts ("Name - Role"). Override any email with E2E_<ROLE>_EMAIL. */
export const ACCOUNTS = {
  companyAdmin: process.env.E2E_COMPANY_ADMIN_EMAIL ?? "portal@hvems.com.au",
  fleetManager: process.env.E2E_FLEET_MANAGER_EMAIL ?? "fleet@hvems.com.au",
  technician: process.env.E2E_TECHNICIAN_EMAIL ?? "technician@hvems.com.au",
  finance: process.env.E2E_FINANCE_EMAIL ?? "finance@hvems.com.au",
  provider: process.env.E2E_PROVIDER_EMAIL ?? "provider@hvems.com.au",
} as const;
export type AccountKey = keyof typeof ACCOUNTS;

/** Saved sessions from auth.setup.ts (git-ignored). */
const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");
fs.mkdirSync(AUTH_DIR, { recursive: true });
export const authFile = (key: AccountKey) => path.join(AUTH_DIR, `${key}.json`);
export const basePathFile = (key: AccountKey) => path.join(AUTH_DIR, `${key}.base`);

/** Skip when no password is configured (e.g. in CI without a running app). */
export function requireCredentials() {
  test.skip(!PASSWORD, "Set E2E_PASSWORD to the development test accounts' password to run end-to-end tests.");
}

/** Use an account's saved session for every test in the current file or describe block. */
export function asAccount(key: AccountKey) {
  requireCredentials();
  if (PASSWORD) test.use({ storageState: authFile(key) });
}

/** The portal base path the account signed in to, e.g. /customer/<org id>. */
export function basePath(key: AccountKey): string {
  return fs.readFileSync(basePathFile(key), "utf8").trim();
}

/** Sign in through the real form and return the portal base path. Retries once (slow first compile, flaky network). */
export async function signIn(page: Page, baseUrl: string, email: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${baseUrl}/login`, { timeout: 120_000 });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
  // Accounts in more than one organisation may land on a chooser: take the first.
  if (page.url().includes("/select-context")) {
    await page.locator("main a").first().click();
    await page.waitForURL((url) => !url.pathname.includes("/select-context"), { timeout: 60_000 });
  }
  const m = new URL(page.url()).pathname.match(/^\/(customer|provider|driver\/o)\/[0-9a-f-]{36}/);
  expect(m, `signed in to a portal page (landed on ${page.url()})`).not.toBeNull();
  return m![0];
}

/** The side menu (desktop). */
export const menu = (page: Page) => page.getByRole("navigation").first();

/** A page rendered without the error screen. */
export async function expectHealthy(page: Page) {
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  await expect(page.locator("h1").first()).toBeVisible();
}

/** Open a portal page (generous timeout: the dev server compiles each route on first visit). */
export async function open(page: Page, url: string) {
  const res = await page.goto(url, { timeout: 120_000 });
  expect(res?.status() ?? 0, `${url} responds`).toBeLessThan(400);
  await expectHealthy(page);
}

/** Every link in the side menu: opens each collapsed group in turn (only three stay open at once). */
export async function menuLinks(page: Page): Promise<Set<string>> {
  const nav = menu(page);
  const names = new Set<string>();
  const collect = async () => {
    for (const t of await nav.getByRole("link").allInnerTexts()) names.add(t.trim());
  };
  await collect();
  const groups = nav.locator("button[aria-expanded]");
  const n = await groups.count();
  for (let i = 0; i < n; i++) {
    const g = groups.nth(i);
    if ((await g.getAttribute("aria-expanded")) !== "true") await g.click();
    await collect();
  }
  return names;
}

/** The role shown in the portal switcher, e.g. "Company Admin" or "Fleet Manager". */
export async function currentRole(page: Page): Promise<string> {
  return (await page.getByRole("button", { name: /switch organisation or portal/i }).innerText()).replace(/\s+/g, " ");
}
