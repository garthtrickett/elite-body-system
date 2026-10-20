import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp } from "../support/app.ts";
import { testDatabaseUrl } from "../support/app.ts";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { createScorecards, emptyScorecard } from "../../src/features/scorecard/index.ts";
import { createLearning, emptyMap } from "../../src/features/learning/index.ts";
import { createContentMedia } from "../../src/features/content/index.ts";
import { completedProfile } from "../support/client.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });

async function signIn(page: Page) {
  const email = `scorecard-${randomUUID()}@example.test`;
  const provisioned = await app.auth.provisionAccount({ email });
  expect(provisioned.ok).toBe(true);
  if (!provisioned.ok) throw new Error("Fixture account failed");
  const db = createDatabase(testDatabaseUrl());
  try {
    const today = new Date().getUTCDay(), trainingDays = [today, ...[1, 2, 3, 4, 5, 6, 0].filter(day => day !== today)].slice(0, 4);
    const restDay = [0, 1, 2, 3, 4, 5, 6].find(day => !trainingDays.includes(day))!;
    const profile = completedProfile({ trainingDays, restDay });
    const profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => new Date(`${completedProfile().startDate}T12:00:00Z`) });
    expect((await profiles.save({ accountId: provisioned.value.id, revision: 0, profile })).ok).toBe(true);
    const learning = createLearning({ db, profiles, media: createContentMedia(db) });
    expect((await learning.saveMap({ accountId: provisioned.value.id, revision: 0, map: { ...emptyMap(), identity: "I keep promises", build: "A strong future", refuse: "Giving up", signals: "More energy", leads: "Being present", final: "Start today", step: 6 }, finish: true })).ok).toBe(true);
    expect((await createScorecards(db).save({ accountId: provisioned.value.id, date: new Date().toISOString().slice(0, 10), revision: 0,
      scorecard: { ...emptyScorecard(), values: { ...emptyScorecard().values, weight: 77.5 } } })).ok).toBe(true);
  } finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: "scorecard-browser" });
  const redeemed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!redeemed.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: redeemed.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(app.origin);
  await expect(page.getByRole("heading", { name: "Day 12", exact: true })).toBeVisible();
}

test("Harry’s shell fits phone and desktop, loads its own fonts under CSP, and exposes all progress cards", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (/Content Security Policy|Refused to/.test(message.text())) errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('400 36px "Instrument Serif"'), document.fonts.load('italic 400 36px "Instrument Serif"'), document.fonts.load('500 16px "Geist"')]);
    await document.fonts.ready;
  });
  expect(await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family, status: face.status })))).toEqual(expect.arrayContaining([
    { family: "Instrument Serif", status: "loaded" }, { family: "Geist", status: "loaded" },
  ]));
  for (const file of ["instrument-serif-regular.woff2", "instrument-serif-italic.woff2", "geist.woff2"]) {
    const response = await page.request.get(`${app.origin}/assets/fonts/${file}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("font/woff2");
  }
  expect(await page.getByRole("heading", { name: "Day 12", exact: true }).evaluate(element => getComputedStyle(element).fontFamily)).toContain("Instrument Serif");
  expect(await page.getByLabel("Calories eaten today").evaluate(element => getComputedStyle(element).fontFamily)).toContain("Geist");
  expect(await page.evaluate(() => document.fonts.check('400 36px "Instrument Serif"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('500 12px "Geist"'))).toBe(true);
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  expect(await page.locator(".sc-app").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(17, 16, 14)");
  expect(await page.getByLabel("Body weight in kg").evaluate(element => getComputedStyle(element).fontSize)).toBe("44px");
  expect(await page.getByLabel("Calories eaten today").evaluate(element => getComputedStyle(element).fontSize)).toBe("26px");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("scorecard-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Show weight trend" }).click();
  await expect(page.getByRole("img", { name: /Weight trend/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("scorecard-trend.png"), fullPage: true });
  await page.getByRole("button", { name: "Show consistency" }).click();
  await expect(page.getByRole("table", { name: "Tracking over the last seven days" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("scorecard-consistency.png"), fullPage: true });
  await page.getByRole("button", { name: "Show body weight" }).click();
  for (const width of [320, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Profile", exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`scorecard-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("metrics complete at Harry’s targets, reject invalid edits, and persist across refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const [label, value, tile] of [
    ["Calories eaten today", "2000", "energy"], ["Protein in grams", "140", "protein"], ["Water in litres", "4", "water"],
    ["Hours slept", "8h30m", "sleep"], ["Steps today", "8,000", "steps"],
  ] as const) {
    const input = page.getByLabel(label);
    await input.fill(value);
    await input.press("Enter");
    await expect(page.getByTestId(`tile-${tile}`)).toHaveClass(/sc-tile-done/);
  }
  await page.getByLabel("Water in litres").fill("99");
  await page.getByLabel("Water in litres").press("Enter");
  await expect(page.getByRole("alert")).toContainText("between 0 and 20");
  await expect(page.getByLabel("Water in litres")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Water in litres").press("Escape");
  await expect(page.getByLabel("Water in litres")).toHaveValue("4");
  await page.getByLabel("Calories eaten today").fill("2500");
  await page.getByLabel("Calories eaten today").press("Tab");
  await expect(page.getByTestId("tile-energy")).not.toHaveClass(/sc-tile-done/);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await page.reload();
  await expect(page.getByLabel("Calories eaten today")).toHaveValue("2500");
  await expect(page.getByLabel("Body weight in kg")).toHaveValue("77.5");
});

test("daily mindset and training interactions work, dialogs trap and restore focus, and user text stays text", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  for (const [label, value] of [["Calories eaten today", "2000"], ["Protein in grams", "150"], ["Water in litres", "4"],
    ["Hours slept", "8"], ["Steps today", "8000"]] as const) {
    await page.getByLabel(label).fill(value);
    await page.getByLabel(label).press("Enter");
  }
  const ltr = page.getByRole("button", { name: "Open L to R" });
  await ltr.click();
  await expect(page.getByRole("dialog", { name: "L to R" })).toBeVisible();
  await page.getByLabel("Left · Brain dump").fill("Make time for myself today");
  const goal = "Walk for 30 minutes";
  await page.getByLabel("Add a goal", { exact: true }).fill(goal);
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByRole("button", { name: `Prioritize ${goal}`, exact: true }).click();
  const unsafe = '<img src=x onerror="alert(1)">';
  await page.getByLabel("Add a goal", { exact: true }).fill(unsafe);
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await expect(page.getByText(unsafe, { exact: true })).toBeVisible();
  await expect(page.locator(".sc-goal img")).toHaveCount(0);
  await page.getByRole("button", { name: `Remove ${unsafe}`, exact: true }).click();
  await page.screenshot({ path: info.outputPath("scorecard-ltr.png"), fullPage: true });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(ltr).toBeFocused();
  await page.getByRole("button", { name: "Mark Focus complete" }).click();
  await expect(page.getByTestId("tile-focus")).toHaveClass(/sc-tile-done/);
  // Native dialog focus stays contained and returns to its opener.
  await ltr.click();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(ltr).toBeFocused();
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await page.getByRole("link", { name: "Read your Neural Map" }).click();
  await page.getByRole("button", { name: "Mark Map read for today" }).click();
  await expect(page.getByRole("button", { name: "✓ Read for today" })).toBeVisible();
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click();
  await expect(page.getByTestId("tile-map")).toHaveClass(/sc-tile-done/);
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await page.getByRole("link", { name: "Training", exact: true }).click();
  await page.locator('input[aria-label$="set 1 weight"]').first().fill("20");
  await page.locator('input[aria-label$="set 1 weight"]').first().press("Enter");
  await page.getByRole("button", { name: /^Complete set 1 for / }).first().click();
  await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
  await page.getByRole("button", { name: "Finish workout", exact: true }).click();
  await expect(page.getByRole("button", { name: "✓ Workout complete", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click();
  await expect(page.getByTestId("tile-training")).toHaveClass(/sc-tile-done/);
  await expect(page.getByRole("status")).toContainText("Day complete");
  await page.screenshot({ path: info.outputPath("scorecard-complete.png"), fullPage: true });
});

test("shell navigation opens saved workflows and leaves sign-out functional after a failed attempt", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Day 1 setup", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Your answers are saved to your account");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Log meal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log a Meal", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.route("**/api/auth/sign-out", route => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code: "unavailable" } }) }), { times: 1 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("sign-out");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${app.origin}/sign-in`);
  await page.goto(app.origin);
  await expect(page).toHaveURL(`${app.origin}/sign-in`);
});
