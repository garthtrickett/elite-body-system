import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { completedProfile } from "../support/client.ts";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { createScorecards, emptyScorecard } from "../../src/features/scorecard/index.ts";
import { createTraining } from "../../src/features/training/index.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
async function signIn(page: Page) {
  const today = new Date().toISOString().slice(0, 10);
  const account = await app.auth.provisionAccount({ email: `audit-${randomUUID()}@example.test` });
  if (!account.ok) throw new Error("Fixture account unavailable");
  const db = createDatabase(testDatabaseUrl());
  try {
    const profiles = createProfiles({ store: createPostgresProfileStore(db) });
    expect((await profiles.save({ accountId: account.value.id, revision: 0, profile: completedProfile({ startDate: today, setupStep: 0 }) })).ok).toBe(true);
    const cards = createScorecards(db), existing = await cards.get({ accountId: account.value.id, date: today });
    if (!existing.ok) throw new Error("Fixture scorecard unavailable");
    expect((await cards.save({ accountId: account.value.id, date: today, revision: existing.value.revision,
      scorecard: { ...emptyScorecard(), values: { ...emptyScorecard().values, weight: 79.6, energy: 2000 } } })).ok).toBe(true);
    const monday = new Date(`${today}T12:00:00Z`);
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() - 1);
    const trainingDate = monday.toISOString().slice(0, 10), training = createTraining({ db, profiles });
    const session = await training.get({ accountId: account.value.id, date: trainingDate });
    if (!session.ok) throw new Error("Fixture workout unavailable");
    expect((await training.save({ accountId: account.value.id, revision: 0,
      workout: { ...session.value.workout, restUntil: Date.now() - 1000 }, finish: false })).ok).toBe(true);
    await app.auth.requestLink({ email: account.value.email, clientKey: randomUUID() });
    const sessionResult = await app.auth.redeemLink({ token: new URL(await app.readLink(account.value.email)).hash.slice(1) });
    if (!sessionResult.ok) throw new Error("Fixture sign-in unavailable");
    await page.context().addCookies([{ name: "ebs-session", value: sessionResult.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
    return { today, trainingDate, accountId: account.value.id };
  } finally { await db.destroy(); }
}

test("mobile navigation has a separate viewport row and never intercepts workout actions", async ({ page }, info) => {
  await signIn(page);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport); await page.goto(app.origin);
    const start = page.getByRole("link", { name: "Start", exact: true }); await start.scrollIntoViewIfNeeded();
    const box = (await start.boundingBox())!, nav = (await page.getByRole("navigation", { name: "Main navigation" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    expect(await start.evaluate(element => {
      const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath(`reachable-start-${viewport.width}.png`) });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/\/training$/);
  }
  for (const path of ["/training", "/meals", "/mindset/map", "/courses/mindset", "/courses/nutrition", "/courses/activity"]) {
    await page.goto(app.origin + path);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeInViewport();
    await page.getByLabel("More navigation", { exact: true }).click();
    await expect(page.locator(".sc-mobile-menu").getByRole("link", { name: "Meals", exact: true })).toBeInViewport();
    await expect(page.locator(".sc-mobile-menu").getByRole("link", { name: "Mindset", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("scorecard presents neutral change, a useful first-weigh-in state and readable entry feedback", async ({ page }, info) => {
  const { today } = await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(app.origin);
  await expect(page.getByRole("region", { name: "Body weight", exact: true })).toContainText("No change");
  await expect(page.getByTestId("tile-energy")).toContainText("Energy (kcal)");
  await expect(page.getByTestId("tile-energy")).toContainText("of 2000 kcal");
  await expect(page.getByTestId("tile-energy")).toContainText("✓ Goal met");
  await expect(page.getByLabel("Water in litres")).toHaveAttribute("placeholder", "Add");
  await page.screenshot({ path: info.outputPath("scorecard-neutral-weight.png") });
  await page.getByRole("button", { name: "Show weight trend" }).click();
  await expect(page.getByRole("region", { name: "Weight trend", exact: true })).toContainText("Log another weigh-in to see your trend.");
  await expect(page.getByRole("img", { name: /Weight trend/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("scorecard-first-weigh-in.png") });
  await page.getByRole("button", { name: "Show consistency" }).click();
  await expect(page.locator('th[aria-current="date"] time')).toHaveAttribute("datetime", today);
  await expect(page.getByRole("region", { name: "Consistency", exact: true })).toContainText("1 of 63 daily entries");
  await page.screenshot({ path: info.outputPath("scorecard-consistency-legend.png") });
  await page.getByLabel("Water in litres").fill("99"); await page.getByLabel("Water in litres").press("Enter");
  await expect(page.getByRole("alert")).toContainText("between 0 and 20");
  expect(await page.getByRole("alert").evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe("0px");
  await page.screenshot({ path: info.outputPath("scorecard-entry-error.png") });
  await page.setViewportSize({ width: 1024, height: 768 }); await page.goto(app.origin);
  await expect(page.getByLabel("Calories eaten today")).toBeInViewport();
  expect((await page.getByTestId("tile-energy").boundingBox())!.y).toBeLessThan(500);
  await page.screenshot({ path: info.outputPath("compact-desktop.png"), fullPage: true });
});

test("training collapses completed rest and exposes exercise navigation and clear set controls", async ({ page }, info) => {
  const { trainingDate } = await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${app.origin}/training?date=${trainingDate}`);
  await expect(page.getByText("✓ Rest complete · Ready for your next set", { exact: true })).toBeVisible();
  expect((await page.locator(".sc-rest-complete").boundingBox())!.height).toBeLessThan(60);
  await expect(page.getByText(/^Exercise 1 of/)).toBeVisible();
  expect((await page.locator(".sc-checkbox").first().boundingBox())!.width).toBeGreaterThanOrEqual(24);
  await page.getByRole("button", { name: "Next exercise", exact: true }).click();
  await expect(page.getByText(/^Exercise 2 of/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weighted Dip", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous exercise", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weighted Pull-up", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("training-rest-and-navigation.png") });
});

test("profile prioritises targets and onboarding explains its sections and close action", async ({ page }, info) => {
  await signIn(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${app.origin}/?panel=profile`);
  await expect(page.getByRole("dialog")).toBeVisible();
  const targets = (await page.getByRole("heading", { name: "Daily targets", exact: true }).boundingBox())!;
  expect(targets.y).toBeLessThan((await page.getByRole("heading", { name: "Your plan", exact: true }).boundingBox())!.y);
  await expect(page.getByLabel("Energy (kcal)")).toBeInViewport();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: "Day 1 setup", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Setup progress" })).toHaveAttribute("max", "34");
  await expect(page.locator('.sc-setup-sections [aria-current="step"]')).toHaveText("1. Your routine");
  await page.screenshot({ path: info.outputPath("setup-progress.png") });
});

test("meal review keeps totals and logging reachable throughout editing on small phones", async ({ page }, info) => {
  await signIn(page); await page.setViewportSize({ width: 320, height: 568 }); await page.goto(`${app.origin}/meals`);
  await expect(page.locator(".sc-upload")).toContainText("JPEG, PNG or WebP");
  await page.getByRole("button", { name: "Enter nutrition manually" }).click();
  await expect(page.getByText(/Photo portions and AI nutrition/)).toHaveCount(0);
  await page.getByLabel("Calories per 100g for ingredient 1").fill("200"); await page.getByLabel("Calories per 100g for ingredient 1").press("Tab");
  for (const field of ["Ingredient 1 name", "Portion for ingredient 1", "Protein per 100g for ingredient 1"]) {
    await page.getByLabel(field, { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /^Log meal for / })).toBeInViewport();
    await expect(page.locator(".sc-meal-quick-log")).toContainText("200 kcal");
  }
  const log = (await page.getByRole("button", { name: /^Log meal for / }).boundingBox())!;
  const nav = (await page.getByRole("navigation", { name: "Main navigation" }).boundingBox())!;
  expect(log.y + log.height).toBeLessThanOrEqual(nav.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("meal-review-320.png") });
});

test("desktop has one sign-in brand and course waiting states show readable next steps", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${app.origin}/sign-in`);
  expect(await page.locator(".sc-brand").evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).length)).toBe(1);
  await page.screenshot({ path: info.outputPath("sign-in-desktop.png") });
  await signIn(page); await page.goto(`${app.origin}/courses/nutrition`);
  await expect(page.locator(".sc-course-welcome")).toContainText("Unlocks in week 2. You’re in week 1.");
  const card = page.locator(".sc-course-card").first();
  await expect(card).toBeDisabled();
  expect(await card.evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  await expect(card).toContainText("Unlocks week 2");
  await page.screenshot({ path: info.outputPath("course-next-step.png"), fullPage: true });
});


test("short landscape setup gives long questions a full scrolling dialog", async ({ page }, info) => {
  const { accountId } = await signIn(page), db = createDatabase(testDatabaseUrl());
  try {
    const profiles = createProfiles({ store: createPostgresProfileStore(db) }), current = await profiles.get({ accountId });
    if (!current.ok) throw new Error("Fixture profile unavailable");
    expect((await profiles.save({ accountId, revision: current.value.revision,
      profile: { ...current.value.profile, completed: false, setupStep: 25 } })).ok).toBe(true);
  } finally { await db.destroy(); }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`${app.origin}/?panel=setup`);
  await expect(page.getByRole("heading", { name: "Health check", exact: true })).toBeVisible();
  expect(await page.locator(".sc-setup-content").evaluate(element => element.clientHeight)).toBeGreaterThan(250);
  await page.screenshot({ path: info.outputPath("landscape-setup-start.png") });
  const next = page.getByRole("button", { name: "Save and continue", exact: true });
  await next.scrollIntoViewIfNeeded(); await expect(next).toBeInViewport();
  await expect(page.getByRole("button", { name: "Close dialog", exact: true })).toBeInViewport();
  const box = (await next.boundingBox())!, dialog = (await page.getByRole("dialog").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(dialog.y + dialog.height);
  await page.screenshot({ path: info.outputPath("landscape-setup-end.png") });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});
