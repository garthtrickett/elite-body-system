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
async function signIn(page: Page) {
  const email = `course-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture provisioning failed");
  const db = createDatabase(testDatabaseUrl()), profile = completedProfile();
  try { const saved = await createProfiles({ store: createPostgresProfileStore(db), now: () => new Date(`${profile.startDate}T12:00:00Z`) }).save({ accountId: account.value.id, revision: 0, profile }); expect(saved.ok).toBe(true); }
  finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const signedIn = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!signedIn.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: signedIn.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
}
async function mapNext(page: Page) {
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
}

test("the full Neural Map build persists drafts, supports a daily read, and updates the scorecard", async ({ page }, info) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page);
  await page.goto(`${app.origin}/mindset/map`);
  await expect(page.getByRole("heading", { name: "Build your Neural Map", exact: true })).toBeVisible();
  await mapNext(page); await mapNext(page);
  await page.getByLabel(/^Who I am/).fill("I train consistently and keep my promises."); await mapNext(page);
  await page.getByLabel(/^The future I’m building/).fill("More energy for my family and work.");
  await page.getByLabel(/^The future I refuse/).fill("Putting my health last every year."); await mapNext(page);
  await page.getByLabel(/^Signs it’s working/).fill("Better sleep and energy at 3pm."); await mapNext(page);
  await page.getByLabel(/^Where this leads/).fill("A standard I carry into everything."); await mapNext(page);
  await page.getByLabel(/^Final statement/).fill("When I want to skip, I start anyway.");
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your Neural Map", exact: true })).toBeVisible();
  await expect(page.getByText("When I want to skip, I start anyway.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark Map read for today", exact: true }).click();
  await expect(page.getByRole("button", { name: "✓ Read for today", exact: true })).toBeDisabled();
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  await page.screenshot({ path: info.outputPath("neural-map.png"), fullPage: true });
  await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click();
  await expect(page.getByTestId("tile-map")).toHaveClass(/sc-tile-done/);
});

test("lesson answers and completion survive reload and unlock the next pillar", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page);
  await page.goto(`${app.origin}/courses/mindset`);
  await expect(page.getByRole("button", { name: /Week 4 · Identity/ })).toBeDisabled();
  await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
  await expect(page.getByText(/The video has not been uploaded yet/)).toBeVisible();
  await page.getByRole("button", { name: "Mark lesson complete", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Answer every task");
  await page.getByLabel("Part 1: who are you becoming? Write it as an instruction.").fill("I train four days a week.");
  await page.getByLabel("When will you read your Map each day?").fill("After breakfast");
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  await page.reload();
  await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
  await expect(page.getByLabel("When will you read your Map each day?")).toHaveValue("After breakfast");
  await page.getByRole("button", { name: "Mark lesson complete", exact: true }).click();
  await expect(page.getByRole("button", { name: "✓ Lesson complete", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: /Week 1 · The Neural Map/ })).toContainText("Complete · tap to review");
  await page.goto(`${app.origin}/courses/nutrition`);
  await expect(page.getByRole("button", { name: /Week 2 · Energy Balance/ })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("nutrition-course.png"), fullPage: true });
});
