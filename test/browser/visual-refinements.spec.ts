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
async function signIn(page: Page, complete = true) {
  const email = `refine-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture account unavailable");
  if (complete) {
    const db = createDatabase(testDatabaseUrl());
    try { expect((await createProfiles({ store: createPostgresProfileStore(db) }).save({ accountId: account.value.id, revision: 0, profile: completedProfile({ story: { ...completedProfile().story, want: "Make time for training, family and work. ".repeat(15) } }) })).ok).toBe(true); }
    finally { await db.destroy(); }
  }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!session.ok) throw new Error("Fixture session unavailable");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
}
test("empty scorecards distinguish targets from entries and do not invent a weight history", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page, false); await page.goto(app.origin); await page.getByRole("dialog").waitFor({ state: "visible" }); await page.keyboard.press("Escape");
  for (const label of ["Calories eaten today", "Protein in grams", "Water in litres", "Hours slept", "Steps today"]) {
    await expect(page.getByLabel(label)).toHaveValue(""); await expect(page.getByLabel(label)).toHaveAttribute("placeholder", "—");
  }
  await expect(page.getByRole("region", { name: "Weight trend", exact: true })).toContainText("Your weigh-ins will appear here.");
  await expect(page.getByRole("img", { name: /Weight trend from/ })).toHaveCount(0);
  await page.reload(); await page.keyboard.press("Escape"); await expect(page.getByLabel("Calories eaten today")).toHaveValue("");
});
test("short desktop dialogs fit their content and long dialogs keep their close action reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page); await page.goto(app.origin);
  const trigger = page.getByRole("button", { name: "Open L to R" }); await trigger.click();
  expect((await page.getByRole("dialog").boundingBox())!.height).toBeLessThan(750);
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("dialog").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("button", { name: "Back to scorecard" })).toBeInViewport();
  await page.getByRole("button", { name: "Back to scorecard" }).click(); await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Day 1 setup", exact: true }).click();
  const next = page.getByRole("button", { name: "Save and continue", exact: true }), before = await next.boundingBox();
  await next.click(); await expect(page.getByRole("dialog")).toContainText("Your setup · 2 of 34"); await expect(next).toBeEnabled();
  expect(Math.abs((await next.boundingBox())!.y - before!.y)).toBeLessThan(2);
});
test("mobile exercise selection scrolls independently and keeps the selected exercise near the top", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page);
  const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1);
  await page.goto(`${app.origin}/training?date=${date.toISOString().slice(0, 10)}`);
  await expect(page.getByRole("heading", { name: "Weighted Pull-up", exact: true })).toBeInViewport();
  const choice = page.getByRole("group", { name: "Workout exercises" }).getByRole("button", { name: /Incline Dumbbell Press/ });
  await choice.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Incline Dumbbell Press", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("desktop meal totals and logging stay beside ingredients while portions are reviewed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page); await page.goto(`${app.origin}/meals`);
  await page.getByRole("button", { name: "Enter nutrition manually" }).click();
  await page.getByLabel("Calories per 100g for ingredient 1").fill("200"); await page.getByLabel("Calories per 100g for ingredient 1").press("Tab");
  await page.getByRole("button", { name: "+ Add ingredient" }).click();
  await page.getByLabel("Portion for ingredient 1").fill("150"); await page.getByLabel("Portion for ingredient 1").press("Tab");
  await expect(page.getByLabel("Meal totals")).toContainText("300 kcal");
  await expect(page.getByRole("button", { name: /^Log meal for / })).toBeInViewport();
  const ingredient = await page.getByLabel("Ingredient 1 name").boundingBox(), totals = await page.getByLabel("Meal totals").boundingBox();
  expect(totals!.x).toBeGreaterThan(ingredient!.x + ingredient!.width);
});
test("failed training and learning loads show a retry state without a permanent loading message", async ({ page }) => {
  await signIn(page);
  for (const [path, endpoint] of [["/training", "training"], ["/mindset/map", "learning"]]) {
    await page.route(`**/api/client/${endpoint}`, route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Could not load your data." } } }), { times: 1 });
    await page.goto(app.origin + path); await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/^Loading your/)).toHaveCount(0);
    await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(/^Loading your/)).toHaveCount(0);
  }
});
