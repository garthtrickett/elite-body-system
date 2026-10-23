import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { completedProfile } from "../support/client.ts";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });

async function signIn(page: Page, setup = false) {
  const email = `brand-${randomUUID()}@a-long-client-company-name.example.test`;
  const account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture provisioning failed");
  const db = createDatabase(testDatabaseUrl());
  const profile = completedProfile({ name: "AlexandraMontgomery".repeat(4), completed: !setup, setupStep: setup ? 10 : 33,
    targets: { energy: 10000, protein: 1000, water: 20, sleep: 24, steps: 100000 } });
  try {
    const saved = await createProfiles({ store: createPostgresProfileStore(db), now: () => new Date(`${profile.startDate}T12:00:00Z`) })
      .save({ accountId: account.value.id, revision: 0, profile });
    expect(saved.ok).toBe(true);
  } finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const result = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!result.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: result.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
}

async function fits(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("scorecard loading, validation and failed saves stay explicit and recoverable", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  let releaseLoad = () => {};
  const loadGate = new Promise<void>(resolve => { releaseLoad = resolve; });
  await page.route("**/api/client/state", async route => { await loadGate; await route.continue(); }, { times: 1 });
  await page.goto(app.origin);
  await expect(page.getByRole("status")).toHaveText("Loading your scorecard…");
  await page.screenshot({ path: info.outputPath("scorecard-loading.png"), fullPage: true });
  releaseLoad();
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await fits(page);
  await page.getByLabel("Water in litres").fill("99");
  await page.getByLabel("Water in litres").press("Enter");
  await expect(page.getByLabel("Water in litres")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("between 0 and 20");
  await page.screenshot({ path: info.outputPath("scorecard-invalid.png"), fullPage: true });
  await page.getByLabel("Water in litres").press("Escape");
  let releaseSave = () => {};
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route("**/api/client/day", async route => {
    await saveGate;
    await route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Your changes could not be saved. Try again." } } });
  }, { times: 1 });
  await page.getByLabel("Steps today").fill("100000");
  await page.getByLabel("Steps today").press("Enter");
  await expect(page.getByTestId("save-status")).toHaveText("Saving…");
  await page.screenshot({ path: info.outputPath("scorecard-saving.png"), fullPage: true });
  releaseSave();
  await expect(page.getByTestId("save-status")).toHaveText("Changes not saved");
  await expect(page.getByLabel("Steps today")).toHaveValue("100000");
  await page.screenshot({ path: info.outputPath("scorecard-save-failed.png"), fullPage: true });
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await page.reload();
  await expect(page.getByLabel("Steps today")).toHaveValue("100000");
});

test("all current workflows fit narrow screens and 200 percent zoom reflow", async ({ page, browser }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  for (const path of ["/", "/training", "/mindset/map", "/courses/nutrition", "/courses/activity", "/courses/mindset", "/meals"]) {
    await page.goto(`${app.origin}${path}`);
    await expect(page.locator(".sc-app h1, .sc-app h2").first()).toBeVisible();
    await expect(page.getByText(/Loading your/)).toHaveCount(0);
    await fits(page);
    if (path === "/training") {
      for (const label of ["History", "Log", "Instructions"]) {
        const tab = page.getByRole("group", { name: "Exercise views" }).getByRole("button", { name: label, exact: true });
        expect((await tab.boundingBox())?.height).toBeLessThan(60);
      }
    }
    await page.screenshot({ path: info.outputPath(`${path.replaceAll("/", "-") || "scorecard"}-320.png`), fullPage: true });
  }
  await page.goto(app.origin);
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await fits(page);
  await expect(page.getByRole("dialog")).toContainText("AlexandraMontgomery".repeat(4));
  await page.screenshot({ path: info.outputPath("profile-long-content.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeFocused();
  // Use a stable context so full-page capture cannot reset emulated metrics.
  // This reproduces the CSS viewport/pixel density of 200% on a 1440px display.
  const zoomed = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  try {
    await zoomed.addCookies(await page.context().cookies());
    const zoomPage = await zoomed.newPage();
    await zoomPage.goto(app.origin);
    await expect(zoomPage.getByTestId("save-status")).toHaveText("Saved to your account");
    await fits(zoomPage);
    const logMeal = zoomPage.getByRole("link", { name: "Log meal", exact: true });
    await logMeal.focus();
    expect(await logMeal.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
    const shell = await zoomPage.locator(".sc-shell").boundingBox();
    expect(shell?.x).toBeGreaterThanOrEqual(0);
    expect((shell?.x ?? 0) + (shell?.width ?? 0)).toBeLessThanOrEqual(720);
    const actionBox = await logMeal.boundingBox();
    const navBox = await zoomPage.getByRole("navigation", { name: "Main navigation" }).boundingBox();
    expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(500);
    expect(navBox?.y).toBeGreaterThan((actionBox?.y ?? 0) + (actionBox?.height ?? 0));
    await zoomPage.screenshot({ path: info.outputPath("scorecard-200-percent.png"), fullPage: true });
  } finally { await zoomed.close(); }
});

test("selected setup choices have a neutral surface and font failure retains a usable form", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, true);
  await page.goto(app.origin);
  await expect(page.getByRole("heading", { name: "Pick your four training days.", exact: true })).toBeVisible();
  await expect(page.locator(".sc-choice-selected")).toHaveCount(4);
  await fits(page);
  await page.screenshot({ path: info.outputPath("setup-selected-choices.png") });
  await page.keyboard.press("Escape");
  let failedFonts = 0;
  await page.route("**/assets/fonts/*.woff2", route => { failedFonts++; return route.abort(); });
  await page.goto(`${app.origin}/sign-in`);
  await page.setViewportSize({ width: 320, height: 700 });
  await fits(page);
  expect(failedFonts).toBeGreaterThan(0);
  await page.getByLabel("Email address").fill("fallback@example.test");
  await page.getByLabel("Email address").press("Tab");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeFocused();
  await page.screenshot({ path: info.outputPath("sign-in-fallback-fonts.png"), fullPage: true });
});
