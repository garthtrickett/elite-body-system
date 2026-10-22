import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { createLearning, emptyMap } from "../../src/features/learning/index.ts";
import { createProfiles } from "../../src/features/profile/index.ts";
import { createContentMedia } from "../../src/features/content/index.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { completedProfile } from "../support/client.ts";
let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
async function signIn(page: Page, modern = false) {
  const email = `refinement-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture provision failed");
  const db = createDatabase(testDatabaseUrl());
  try { expect(await createPostgresProfileStore(db).write({ accountId: account.value.id, revision: 0, profile: { ...completedProfile(), ...(modern ? { onboardingVersion: "harry-v2" as const } : {}) } })).toBeTruthy(); }
  finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const auth = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!auth.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: auth.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  return account.value.id;
}

test("profile targets and unadded goals warn before navigation and remain available when exit is cancelled", async ({ page }) => {
  await signIn(page); await page.goto(app.origin + "/?panel=profile");
  const energy = page.getByLabel("Energy (kcal)", { exact: true }); await energy.fill("2417");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  let warnings = 0;
  page.on("dialog", async dialog => { expect(dialog.type()).toBe("beforeunload"); warnings++; await dialog.dismiss(); });
  await page.getByRole("link", { name: "Training", exact: true }).first().click({ noWaitAfter: true });
  await expect.poll(() => warnings).toBe(1); await expect(page).toHaveURL(app.origin + "/?panel=profile");
  await page.getByRole("button", { name: "Profile", exact: true }).first().click(); await expect(energy).toHaveValue("2417");
});

test("cancelling sign-out leaves both the unsaved draft and authenticated session intact", async ({ page }) => {
  await signIn(page); await page.goto(app.origin + "/?panel=profile");
  await page.getByLabel("Energy (kcal)", { exact: true }).fill("2417");
  let confirmations = 0;
  page.on("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); confirmations++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => confirmations).toBe(1); await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Energy (kcal)", { exact: true })).toHaveValue("2417");
  expect((await page.request.get(app.origin + "/api/auth/session")).status()).toBe(200);
});

test("accepted sign-out asks once before revoking the session", async ({ page }) => {
  await signIn(page); await page.goto(app.origin + "/?panel=profile"); await page.getByLabel("Energy (kcal)", { exact: true }).fill("2417");
  const dialogs: string[] = []; page.on("dialog", async dialog => { dialogs.push(dialog.type()); await dialog.accept(); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/sign-in");
  expect(dialogs).toEqual(["confirm"]); expect((await page.request.get(app.origin + "/api/auth/session")).status()).toBe(401);
});

test("new-onboarding clients reach their saved eight-section flow from setup navigation", async ({ page }) => {
  await signIn(page, true); await page.goto(app.origin);
  await page.getByRole("button", { name: "Day 1 setup", exact: true }).first().click(); await expect(page).toHaveURL(app.origin + "/onboarding");
  await expect(page.getByRole("heading", { name: "Welcome", exact: true })).toBeVisible();
  await page.goto(app.origin + "/?panel=setup"); await expect(page).toHaveURL(app.origin + "/onboarding");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("failed learning save reload can be cancelled without losing the draft", async ({ page }) => {
  await signIn(page); await page.goto(app.origin + "/mindset/map");
  await page.route("**/api/client/learning/map", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Fixture save failed" } }) }));
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("save failed");
  page.once("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Reload saved version", exact: true }).click();
  await expect(page.getByText("Your unsaved changes were kept.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("learning-save-status")).toHaveText("Changes not saved");
  await page.unroute("**/api/client/learning/map"); await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
});

test("an older finish response leaves newer incomplete Map edits in the builder", async ({ page }) => {
  const accountId = await signIn(page), db = createDatabase(testDatabaseUrl());
  const map = { ...emptyMap(), identity: "Identity", build: "Build", refuse: "Refuse", signals: "Signals", leads: "Leads", final: "Final", step: 6 };
  try { expect((await createLearning({ db, profiles: createProfiles({ store: createPostgresProfileStore(db) }), media: createContentMedia(db) }).saveMap({ accountId, revision: 0, map, finish: true })).ok).toBe(true); }
  finally { await db.destroy(); }
  await page.goto(app.origin + "/mindset/map"); await page.getByRole("button", { name: "Edit my Map", exact: true }).click();
  let release: () => void = () => {}, reached: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), finishing = new Promise<void>(resolve => { reached = resolve; });
  await page.route("**/api/client/learning/map", async route => { if (route.request().postDataJSON().finish === true) { reached(); await held; } await route.continue(); });
  try {
    await page.getByRole("button", { name: "Save my Map", exact: true }).click(); await finishing;
    const field = page.getByLabel(/^Final statement/); await field.fill(""); release();
    await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
    await expect(field).toBeVisible(); await expect(field).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Your Neural Map", exact: true })).toHaveCount(0);
  } finally { release(); }
});
