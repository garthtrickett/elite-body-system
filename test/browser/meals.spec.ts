import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { completedProfile } from "../support/client.ts";
import { emptyMeal } from "../../src/features/meals/index.ts";
let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
async function signIn(page: Page) {
  const email = `meal-browser-${randomUUID()}@example.test`, result = await app.auth.provisionAccount({ email });
  if (!result.ok) throw new Error("Fixture account failed");
  const db = createDatabase(testDatabaseUrl());
  try { expect((await createProfiles({ store: createPostgresProfileStore(db) }).save({ accountId: result.value.id, revision: 0, profile: completedProfile() })).ok).toBe(true); } finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); if (!session.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  await page.goto(`${app.origin}/meals`);
  await expect(page.getByRole("heading", { name: "Log a Meal", exact: true })).toBeVisible();
}
test("manual review, safe retry, My Meals and removal update persisted scorecard totals", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page);
  await expect(page.getByRole("button", { name: "Analyse meal", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Enter nutrition manually", exact: true }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Late lunch");
  await page.getByLabel("Calories per 100g for ingredient 1").fill("400");
  await page.getByLabel("Protein per 100g for ingredient 1").fill("30"); await page.getByLabel("Protein per 100g for ingredient 1").press("Tab");
  await page.getByLabel("Save to My Meals for next time").check();
  for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`meal-review-${width}.png`), fullPage: true }); }
  await page.route("**/api/client/meals/log", async route => { const result = await route.fetch(); expect(result.ok()).toBe(true); await route.abort(); }, { times: 1 });
  await page.getByRole("button", { name: /^Log meal for / }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Meal name", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry same action", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Meal added to your day’s calories and protein.");
  await page.reload();
  await page.getByRole("button", { name: /^Late lunch ›/ }).click();
  await page.getByLabel("Portion for ingredient 1").fill("150"); await page.getByLabel("Portion for ingredient 1").press("Tab");
  await expect(page.getByLabel("Meal totals")).toContainText("600 kcal");
  await page.getByRole("button", { name: /^Log meal for / }).click();
  await expect(page.getByRole("status")).toHaveText("Meal added to your day’s calories and protein.");
  await page.getByRole("button", { name: "Remove Late lunch from this day", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Remove Late lunch from this day", exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click();
  await expect(page.getByLabel("Calories eaten today")).toHaveValue("400"); await expect(page.getByLabel("Protein in grams")).toHaveValue("30");
  await page.reload(); await expect(page.getByLabel("Calories eaten today")).toHaveValue("400");
});

test("photos are resized locally and analysis remains an editable review until explicitly logged", async ({ page }) => {
  await page.route("**/api/client/meals", async route => { const response = await route.fetch(); const body = await response.json(); body.value.analysisAvailable = true; await route.fulfill({ response, json: body }); });
  let analysed = false;
  await page.route("**/api/client/meals/analyze", async route => {
    const payload = route.request().postDataJSON(); expect(payload.description).toContain("yogurt"); expect(payload.photos).toHaveLength(1); expect(payload.photos[0].mediaType).toBe("image/jpeg"); expect(payload.photos[0].data.length).toBeLessThan(1398105); analysed = true;
    await route.fulfill({ json: { ok: true, value: { ...emptyMeal(), name: "Yogurt", note: "Estimated portion; check label", items: [{ ...emptyMeal().items[0], grams: 200, source: "ai_estimate", per100: { ...emptyMeal().items[0]!.per100, energy: 80, protein: 10 } }] } } });
  });
  await signIn(page); await page.getByLabel("What did you eat?").fill("One serving of yogurt");
  const photo = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 2000; canvas.height = 1000; const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 2000, 1000); return canvas.toDataURL("image/png").split(",")[1]!; });
  await page.getByLabel("Meal photos", { exact: true }).setInputFiles({ name: "label.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
  await expect(page.getByAltText("Meal photo 1")).toBeVisible();
  await page.getByRole("button", { name: "Analyse meal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make it yours.", exact: true })).toBeVisible(); expect(analysed).toBe(true);
  await expect(page.getByText("No meals logged for this date.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Meal totals")).toContainText("160 kcal");
  await page.getByLabel("Portion for ingredient 1").fill("150"); await page.getByLabel("Portion for ingredient 1").press("Tab");
  await expect(page.getByLabel("Meal totals")).toContainText("120 kcal");
  await page.getByRole("button", { name: /^Log meal for / }).click();
  await expect(page.getByRole("status")).toHaveText("Meal added to your day’s calories and protein.");
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click(); await expect(page.getByLabel("Calories eaten today")).toHaveValue("120"); await expect(page.getByLabel("Protein in grams")).toHaveValue("15");
});
