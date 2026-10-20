import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { createScorecards, emptyScorecard } from "../../src/features/scorecard/index.ts";
import { completedProfile } from "../support/client.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
async function signIn(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const email = `desktop-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture account unavailable");
  const db = createDatabase(testDatabaseUrl());
  try {
    expect((await createProfiles({ store: createPostgresProfileStore(db), now: () => new Date(`${completedProfile().startDate}T12:00:00Z`) }).save({ accountId: account.value.id, revision: 0, profile: completedProfile() })).ok).toBe(true);
    expect((await createScorecards(db).save({ accountId: account.value.id, date: new Date().toISOString().slice(0, 10), revision: 0,
      scorecard: { ...emptyScorecard(), values: { ...emptyScorecard().values, weight: 78.3 } } })).ok).toBe(true);
  }
  finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!session.ok) throw new Error("Fixture session unavailable");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace navigation" });
async function sideBySide(left: Locator, right: Locator) {
  const a = await left.boundingBox(), b = await right.boundingBox();
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x);
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
function lastMonday() {
  const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCDate(date.getUTCDate() - 7); return date.toISOString().slice(0, 10);
}

test("desktop scorecard keeps progress visible and account dialogs work across routes and screen sizes", async ({ page }, info) => {
  await signIn(page); await page.goto(app.origin);
  await expect(page.getByLabel("Calories eaten today")).toBeVisible();
  for (const width of [1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(nav(page).getByRole("link", { name: "Scorecard", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Body weight", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /Weight trend from/ })).toBeVisible();
    expect(await page.getByRole("img", { name: /Weight trend from/ }).evaluate(element =>
      [...element.children].some(child => child instanceof SVGGraphicsElement && child.getBBox().width > 0))).toBe(true);
    await expect(page.getByRole("table", { name: "Tracking over the last seven days" })).toBeVisible();
    await fits(page);
    await page.screenshot({ path: info.outputPath(`scorecard-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Calories eaten today").fill("2150"); await page.getByLabel("Calories eaten today").press("Enter");
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await nav(page).getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await page.getByRole("dialog").boundingBox())!.width).toBeGreaterThan(600);
  await page.screenshot({ path: info.outputPath("profile-desktop.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(nav(page).getByRole("button", { name: "Profile", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Open L to R" }).click();
  await sideBySide(page.getByLabel("Left · Brain dump"), page.getByLabel("Add a goal", { exact: true }));
  await page.getByLabel("Left · Brain dump").fill("Plan my training week");
  await page.getByLabel("Add a goal", { exact: true }).fill("Book training time");
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByRole("button", { name: "Prioritize Book training time", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await nav(page).getByRole("link", { name: "Training", exact: true }).click();
  await expect(nav(page).getByRole("link", { name: "Training", exact: true })).toHaveAttribute("aria-current", "page");
  await nav(page).getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Calories eaten today")).toHaveValue("2150");
  await page.goto(`${app.origin}/?panel=setup`);
  await expect(page.getByRole("dialog")).toContainText("Step 1 of 34");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav(page)).toBeHidden();
  await page.getByRole("button", { name: "Show weight trend" }).click();
  await expect(page.getByLabel("Body weight in kg")).toBeHidden();
  await expect(page.getByRole("img", { name: /Weight trend from/ })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel("Body weight in kg")).toBeVisible();
  await expect(page.getByLabel("Body weight in kg")).toHaveCount(1);
  await fits(page);
});

test("desktop workouts and learning keep selection beside the work and persist edits", async ({ page }, info) => {
  test.setTimeout(45000);
  await signIn(page); await page.goto(`${app.origin}/training?date=${lastMonday()}`);
  await expect(page.getByLabel("Weighted Pull-up set 1 weight")).toBeVisible();
  await sideBySide(page.getByRole("group", { name: "Workout exercises" }), page.getByRole("group", { name: "Exercise views" }));
  await page.getByLabel("Weighted Pull-up set 1 weight").fill("12"); await page.getByLabel("Weighted Pull-up set 1 weight").press("Enter");
  await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(page.getByText("Drive your elbows into your back pockets.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("training-desktop.png"), fullPage: true });
  await page.reload(); await expect(page.getByLabel("Weighted Pull-up set 1 weight")).toHaveValue("12");
  await nav(page).getByRole("link", { name: "Mindset", exact: true }).click();
  await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
  await sideBySide(page.getByRole("button", { name: /Week 1 · The Neural Map/ }), page.getByRole("article", { name: "Current lesson" }));
  await page.getByLabel("When will you read your Map each day?").fill("After breakfast on weekdays");
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  await page.screenshot({ path: info.outputPath("course-desktop.png"), fullPage: true });
  await page.reload(); await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
  await expect(page.getByLabel("When will you read your Map each day?")).toHaveValue("After breakfast on weekdays");
  await nav(page).getByRole("link", { name: "Neural Map", exact: true }).click();
  for (let index = 0; index < 2; index++) {
    await page.getByRole("button", { name: "Save and continue", exact: true }).click();
    await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  }
  await expect(page.getByLabel(/^Who I am/)).toBeVisible();
  await sideBySide(page.locator(".sc-map-context"), page.getByLabel(/^Who I am/));
  await page.getByLabel(/^Who I am/).fill("I keep the promises I make to myself.");
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  await page.screenshot({ path: info.outputPath("map-builder-desktop.png"), fullPage: true });
  for (const width of [1024, 1440, 1920]) { await page.setViewportSize({ width, height: 900 }); await fits(page); }
});

test("desktop meal review logs beside day history without losing portion changes", async ({ page }, info) => {
  await signIn(page); await page.goto(`${app.origin}/meals`);
  await expect(page.getByRole("heading", { name: "Log a Meal", exact: true })).toBeVisible();
  await sideBySide(page.getByLabel("What did you eat?"), page.getByRole("heading", { name: "My Meals", exact: true }));
  await page.screenshot({ path: info.outputPath("meals-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Enter nutrition manually", exact: true }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Desk lunch");
  await page.getByLabel("Calories per 100g for ingredient 1").fill("200"); await page.getByLabel("Calories per 100g for ingredient 1").press("Tab");
  await page.getByLabel("Protein per 100g for ingredient 1").fill("20"); await page.getByLabel("Protein per 100g for ingredient 1").press("Tab");
  await page.getByLabel("Portion for ingredient 1").fill("150"); await page.getByLabel("Portion for ingredient 1").press("Tab");
  await expect(page.getByLabel("Meal totals")).toContainText("300 kcal");
  await page.getByLabel("Save to My Meals for next time").check();
  await page.screenshot({ path: info.outputPath("meal-review-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /^Log meal for / }).click();
  await expect(page.getByRole("status")).toHaveText("Meal added to your day’s calories and protein.");
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Desk lunch from this day", exact: true })).toBeVisible();
  for (const width of [1024, 1440, 1920]) { await page.setViewportSize({ width, height: 900 }); await fits(page); }
  await nav(page).getByRole("link", { name: "Scorecard", exact: true }).click();
  await expect(page.getByLabel("Calories eaten today")).toHaveValue("300");
  await expect(page.getByLabel("Protein in grams")).toHaveValue("30");
});
