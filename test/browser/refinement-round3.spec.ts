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
  const email = `round3-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture account failed");
  const db = createDatabase(testDatabaseUrl());
  try { expect((await createProfiles({ store: createPostgresProfileStore(db) }).save({ accountId: account.value.id, revision: 0, profile: completedProfile() })).ok).toBe(true); }
  finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const auth = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!auth.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: auth.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
}
function monday(offset = 0) {
  const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}

test("failed workout saves show unsaved status, preserve cancelled reloads, retry, and allow explicit discard", async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await signIn(page); await page.goto(`${app.origin}/training?date=${monday(-7)}`);
    const note = page.getByLabel("Your notes for Weighted Pull-up");
    const fail = () => page.route("**/api/client/training", route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Fixture save failed" } } }));
    await fail(); await note.fill("Important unsaved exercise note");
    await expect(page.getByRole("alert")).toContainText("Fixture save failed"); await expect(page.getByTestId("training-save-status")).toHaveText("Changes not saved");
    page.once("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
    await page.getByRole("button", { name: "Reload saved workout", exact: true }).click();
    await expect(note).toHaveValue("Important unsaved exercise note"); await expect(page.getByTestId("training-save-status")).toHaveText("Changes not saved");
    await page.screenshot({ path: info.outputPath(`workout-recovery-${width}.png`) });
    await page.unroute("**/api/client/training"); await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account"); await page.reload(); await expect(note).toHaveValue("Important unsaved exercise note");
    await fail(); await note.fill("Explicitly discard this later edit"); await expect(page.getByRole("alert")).toContainText("Fixture save failed");
    await page.unroute("**/api/client/training"); page.once("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
    await page.getByRole("button", { name: "Reload saved workout", exact: true }).click();
    await expect(note).toHaveValue("Important unsaved exercise note"); await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
  }
});

test("raw set drafts survive date changes and cancelled navigation, and a saved field leaves on the first click", async ({ page }, info) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 }); await signIn(page); await page.goto(`${app.origin}/training?date=${monday(-7)}`);
    const reps = page.getByLabel("Weighted Pull-up set 1 reps"); await reps.fill("7.5");
    await expect(page.getByTestId("training-save-status")).toHaveText("Changes not saved");
    await page.getByLabel("Workout date").fill(monday()); await page.getByLabel("Workout date").dispatchEvent("change");
    await expect(page.getByLabel("Workout date")).toHaveValue(monday(-7)); await expect(reps).toHaveValue("7.5");
    await page.screenshot({ path: info.outputPath(`set-draft-${width}.png`) });
    let warnings = 0;
    const dismiss = async (dialog: import("@playwright/test").Dialog) => { expect(dialog.type()).toBe("beforeunload"); warnings++; await dialog.dismiss(); };
    page.once("dialog", dismiss); await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click({ noWaitAfter: true });
    await expect.poll(() => warnings).toBe(1); await expect(page).toHaveURL(`${app.origin}/training?date=${monday(-7)}`); await expect(reps).toHaveValue("7.5");
    await reps.fill("8"); await reps.press("Enter"); await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
    await page.getByRole("link", { name: "‹ Scorecard", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/");
  }
});

test("an invalid meal ingredient can be removed while other raw portions remain editable", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page); await page.goto(app.origin + "/meals");
  await page.getByRole("button", { name: "Enter nutrition manually", exact: true }).click();
  await page.getByRole("button", { name: "+ Add ingredient", exact: true }).click(); await page.getByRole("button", { name: "+ Add ingredient", exact: true }).click();
  await page.getByLabel("Ingredient 2 name", { exact: true }).fill(""); await page.getByLabel("Portion for ingredient 1", { exact: true }).fill("150");
  await page.getByLabel("Portion for ingredient 3", { exact: true }).fill("-15");
  await page.getByRole("button", { name: "Remove ingredient 2", exact: true }).click();
  await expect(page.getByLabel("Ingredient 3 name", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Ingredient 2 name", { exact: true })).toHaveValue("Ingredient");
  await expect(page.getByLabel("Portion for ingredient 1", { exact: true })).toHaveValue("150"); await expect(page.getByLabel("Portion for ingredient 2", { exact: true })).toHaveValue("-15");
  await page.screenshot({ path: info.outputPath("ingredient-removal.png") });
  await page.getByLabel("Portion for ingredient 2", { exact: true }).fill("75"); await page.getByLabel("Portion for ingredient 2", { exact: true }).press("Tab");
  await expect(page.getByLabel("Portion for ingredient 1", { exact: true })).toHaveValue("150"); await expect(page.getByLabel("Portion for ingredient 2", { exact: true })).toHaveValue("75");
});
