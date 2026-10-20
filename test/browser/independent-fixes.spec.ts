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
async function signIn(page: Page) {
  const email = `independent-fixes-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture account unavailable");
  const db = createDatabase(testDatabaseUrl());
  try {
    const profiles = createProfiles({ store: createPostgresProfileStore(db) });
    expect((await profiles.save({ accountId: account.value.id, revision: 0,
      profile: completedProfile({ startDate: new Date().toISOString().slice(0, 10) }) })).ok).toBe(true);
  } finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!session.ok) throw new Error("Fixture sign-in unavailable");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
}

test("opening meal review establishes its heading and invalid fields explain how to recover", async ({ page }, info) => {
  await signIn(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await page.goto(app.origin + "/meals");
    await page.getByRole("button", { name: "Enter nutrition manually" }).scrollIntoViewIfNeeded();
    expect(await page.locator(".sc-workspace-body").evaluate(element => element.scrollTop)).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Enter nutrition manually" }).click();
    const heading = page.getByRole("heading", { name: "Make it yours.", exact: true });
    await expect(heading).toBeFocused(); await expect(heading).toBeInViewport();
    await expect(page.getByLabel("Meal name", { exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`review-open-${width}.png`) });
    const calories = page.getByLabel("Calories per 100g for ingredient 1");
    await calories.fill("abc"); await calories.press("Tab");
    await expect(calories).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#meal-error-0-energy")).toContainText("0 and 1,000");
    await expect(page.locator(".sc-meal-quick-log")).toContainText("Check highlighted fields");
    await expect(page.getByRole("button", { name: /^Log meal for / })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`review-error-${width}.png`) });
    await calories.fill("200"); await calories.press("Tab");
    await expect(calories).toHaveAttribute("aria-invalid", "false");
    await expect(page.getByRole("button", { name: /^Log meal for / })).toBeEnabled();
    await expect(page.locator(".sc-meal-quick-log")).toContainText("200 kcal");
    await expect(page.getByLabel("Meal totals")).toBeHidden();
    await page.getByText("Nutrition breakdown", { exact: true }).click();
    await expect(page.locator(".sc-mobile-nutrients")).toContainText("Carbs:");
    await page.getByRole("button", { name: "Cancel review", exact: true }).click();
  }
});

test("unfinished meal navigation requires an explicit discard decision", async ({ page }) => {
  await signIn(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app.origin); await page.getByRole("link", { name: "Log meal", exact: true }).click();
  await page.getByRole("button", { name: "Enter nutrition manually" }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Unfinished lunch");
  await page.getByRole("button", { name: "+ Add ingredient", exact: true }).click();
  const cancelled = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Training", exact: true }).click();
  await cancelled;
  await expect(page).toHaveURL(app.origin + "/meals");
  await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue("Unfinished lunch");
  await expect(page.getByLabel("Ingredient 2 name", { exact: true })).toHaveValue("Ingredient");
  const backDialog = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss(); });
  const back = page.goBack({ waitUntil: "commit", timeout: 5000 }).catch(() => null);
  await backDialog; await back;
  await expect(page).toHaveURL(app.origin + "/meals");
  await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue("Unfinished lunch");
  const allowed = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click();
  await allowed;
  await expect(page).toHaveURL(app.origin + "/");
});

test("exercise arrows keep the selected card visible without moving the workout vertically", async ({ page }, info) => {
  await signIn(page); await page.setViewportSize({ width: 390, height: 844 });
  const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1);
  await page.goto(`${app.origin}/training?date=${date.toISOString().slice(0, 10)}`);
  const strip = page.getByRole("group", { name: "Workout exercises" }), choices = strip.getByRole("button");
  await expect(choices.first()).toBeVisible(); const count = await choices.count();
  const before = await page.locator(".sc-workspace-body").evaluate(element => element.scrollTop);
  for (let index = 1; index < count; index++) await page.getByRole("button", { name: "Next exercise", exact: true }).click();
  await expect(choices.last()).toHaveAttribute("aria-pressed", "true");
  const container = (await strip.boundingBox())!, selected = (await choices.last().boundingBox())!;
  expect(selected.x).toBeGreaterThanOrEqual(container.x - 1);
  expect(selected.x + selected.width).toBeLessThanOrEqual(container.x + container.width + 1);
  expect(await page.locator(".sc-workspace-body").evaluate(element => element.scrollTop)).toBe(before);
  await page.screenshot({ path: info.outputPath("last-exercise.png") });
});

test("More identifies its destinations and dismisses with Escape and outside taps", async ({ page }, info) => {
  await signIn(page); await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/meals", "/mindset/map", "/courses/mindset", "/courses/nutrition", "/courses/activity"]) {
    await page.goto(app.origin + path);
    const more = page.getByRole("button", { name: "More navigation", exact: true });
    await expect(more).toHaveClass(/sc-nav-active/);
    await more.click(); await expect(page.locator(".sc-mobile-menu")).toBeVisible();
    await expect(page.locator('.sc-mobile-menu [aria-current="page"]')).toHaveAttribute("href", path);
    expect(await page.locator('.sc-mobile-menu [aria-current="page"]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(39, 37, 31)");
    await page.keyboard.press("Escape"); await expect(page.locator(".sc-mobile-menu")).toBeHidden(); await expect(more).toBeFocused();
    await more.click(); await page.mouse.click(5, 5); await expect(page.locator(".sc-mobile-menu")).toBeHidden();
  }
  await page.screenshot({ path: info.outputPath("more-active.png") });
});

test("mobile locked courses retain guidance and landscape review leaves room for the task", async ({ page }, info) => {
  await signIn(page);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const pillar of ["nutrition", "activity"]) {
      await page.goto(`${app.origin}/courses/${pillar}`);
      await expect(page.locator(".sc-course-next")).toBeVisible();
      await expect(page.locator(".sc-course-next")).toContainText("You’re in week 1.");
      await expect(page.getByRole("link", { name: "Go to today’s scorecard", exact: true })).toBeVisible();
    }
  }
  await page.screenshot({ path: info.outputPath("locked-course-mobile.png") });
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto(app.origin + "/meals");
  await page.getByRole("button", { name: "Enter nutrition manually" }).click();
  const content = (await page.locator(".sc-workspace-body").boundingBox())!;
  expect(content.height).toBeGreaterThanOrEqual(286);
  await expect(page.getByRole("heading", { name: "Make it yours.", exact: true })).toBeInViewport();
  await expect(page.getByLabel("Meal name", { exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("landscape-review.png") });
});

test("profile exit is secondary and Map teaching paragraphs have a readable measure", async ({ page }, info) => {
  await signIn(page); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(app.origin + "/?panel=profile");
  const signOut = page.getByRole("button", { name: "Sign out", exact: true }); await signOut.scrollIntoViewIfNeeded();
  expect(await signOut.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgb(243, 240, 234)");
  expect((await signOut.boundingBox())!.width).toBeLessThan((await page.getByRole("dialog").boundingBox())!.width * .6);
  await page.screenshot({ path: info.outputPath("profile-exit.png") });
  await page.keyboard.press("Escape"); await page.goto(app.origin + "/mindset/map");
  const prose = page.locator(".sc-map-context .sc-panel-card .sc-copy").first(); await expect(prose).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const characters = await prose.evaluate(element => {
    const style = getComputedStyle(element), canvas = document.createElement("canvas"), paint = canvas.getContext("2d")!;
    paint.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return element.getBoundingClientRect().width / paint.measureText("0").width;
  });
  expect(characters).toBeLessThanOrEqual(75);
  await page.screenshot({ path: info.outputPath("map-measure.png"), fullPage: true });
});
