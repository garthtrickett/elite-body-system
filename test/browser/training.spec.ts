import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { completedProfile } from "../support/client.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
async function signIn(page: Page, flagged = false) {
  const email = `workout-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture provisioning failed");
  const db = createDatabase(testDatabaseUrl());
  try {
    const profile = completedProfile(flagged ? { health: { answers: [true, false, false, false, false, false, false], details: "Needs clearance", clearance: false } } : {});
    const saved = await createProfiles({ store: createPostgresProfileStore(db) }).save({ accountId: account.value.id, revision: 0, profile });
    expect(saved.ok).toBe(true);
  } finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const signedIn = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!signedIn.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: signedIn.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
}
function monday(offset = 0) {
  const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
test("set logs, instructions, history and timers survive refresh, then a completed workout shows in history", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(`${app.origin}/training?date=${monday(-7)}`);
  await expect(page.getByRole("heading", { name: "Compound Day", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true })).toHaveText("○");
  await page.getByLabel("Weighted Pull-up set 1 weight").fill("15"); await page.getByLabel("Weighted Pull-up set 1 weight").press("Enter");
  await page.getByLabel("Weighted Pull-up set 1 reps").fill("5"); await page.getByLabel("Weighted Pull-up set 1 reps").press("Enter");
  await page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true })).toHaveText("✓");
  await expect(page.getByLabel("Rest remaining")).toContainText(/4:|5:/);
  await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
  await page.reload();
  await expect(page.getByLabel("Weighted Pull-up set 1 weight")).toHaveValue("15");
  await expect(page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Rest remaining")).toContainText(/4:|5:/);
  await page.getByRole("button", { name: "+30 seconds", exact: true }).click();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(page.getByText("Drive your elbows into your back pockets.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByLabel("Your notes for Weighted Pull-up").fill("Full range, steady reps");
  await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
  await page.getByRole("button", { name: "Finish workout", exact: true }).click();
  await expect(page.getByRole("button", { name: "✓ Workout complete", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("completed-training.png"), fullPage: true });
  const date = new Date(`${monday()}T12:00:00Z`);
  await page.getByLabel("Workout date").fill(date.toISOString().slice(0, 10));
  await page.getByLabel("Workout date").dispatchEvent("change");
  await expect(page.getByLabel("Weighted Pull-up set 1 weight")).toHaveValue("");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByText("15 kg × 5", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("health holds are visible in the browser and cannot be bypassed by opening the training URL", async ({ page }) => {
  await signIn(page, true);
  await page.goto(`${app.origin}/training`);
  await expect(page.getByRole("heading", { name: "Clearance first.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish workout", exact: true })).toHaveCount(0);
});
