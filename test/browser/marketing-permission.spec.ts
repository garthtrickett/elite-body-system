import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../../src/platform/database/connection.ts";
import type { OnboardingSettings, OnboardingSettingsKey } from "../../src/platform/database/generated/public/OnboardingSettings.ts";
import { createOnboarding, createAssessmentMedia, createMarketingPermissions, DRAFT_MARKETING_RELEASE, emptyMarketingPermission, mediaSlots } from "../../src/features/onboarding/index.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { onboardingContent, onboardingAnswers, memoryAssessmentStorage, videoBytes, jpegBytes } from "../support/onboarding.ts";

const db = createDatabase(testDatabaseUrl()), memory = memoryAssessmentStorage();
const onboarding = createOnboarding({ db }), marketing = createMarketingPermissions({ db }), media = createAssessmentMedia({ db, storage: memory.storage });
const release = { ...DRAFT_MARKETING_RELEASE, version: "browser-marketing-v1", approved: true, text: "TEST ONLY: optional release fixture." };
let app: Awaited<ReturnType<typeof startTestApp>>;
const settingsKeys = ["content", "marketing-release"] as OnboardingSettingsKey[];
let previousSettings: readonly OnboardingSettings[] = [];
test.beforeAll(async () => {
  previousSettings = await db.selectFrom("onboarding_settings").selectAll().where("key", "in", settingsKeys).execute();
  app = await startTestApp({ onboardingEnabled: true, assessmentStorage: memory.storage });
  expect((await onboarding.configure({ content: onboardingContent() })).ok).toBe(true);
});
test.beforeEach(async () => { expect((await marketing.configure({ release })).ok).toBe(true); });
test.afterAll(async () => {
  try {
    await db.transaction().execute(async transaction => {
      await transaction.deleteFrom("onboarding_settings").where("key", "in", settingsKeys).execute();
      if (previousSettings.length) await transaction.insertInto("onboarding_settings").values(previousSettings.map(row => ({ ...row, data: sql`cast(${JSON.stringify(row.data)} as jsonb)` }))).execute();
    });
  } finally { await app.close(); await db.destroy(); }
});
async function signIn(page: Page) {
  const email = `marketing-browser-${randomUUID()}@example.test`;
  const provisioned = await app.auth.provisionAccount({ email }); if (!provisioned.ok) throw new Error("Provisioning failed");
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const signed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); if (!signed.ok) throw new Error("Sign-in failed");
  expect((await onboarding.save({ accountId: provisioned.value.id, revision: 0, contentVersion: onboardingContent().version, answers: onboardingAnswers() })).ok).toBe(true);
  await page.context().addCookies([{ name: "ebs-session", value: signed.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  await page.route("https://example.test/**", route => route.fulfill({ status: 200, body: "" }));
  await page.goto(app.origin + "/onboarding"); await audit(page);
  return provisioned.value.id;
}
async function audit(page: Page) {
  await expect(page.locator(".ob-main > fieldset.ob-fields")).toBeVisible();
  const menu = page.locator(".ob-nav-mobile");
  if (await menu.isVisible() && await menu.getAttribute("open") === null) await menu.locator("summary").click();
  await page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Fitness Participation Agreement/ }).click();
  await expect(page.getByRole("heading", { name: "Media & Testimonial Release" })).toBeVisible();
}
function panel(page: Page) { return page.getByRole("region", { name: "Optional marketing permission" }); }
async function choose(page: Page) {
  const form = panel(page);
  await form.getByLabel("Fitness results and progress measurements", { exact: true }).check();
  await form.getByLabel("EBS websites and landing pages", { exact: true }).check();
  await form.getByLabel("Specific materials or restrictions (optional)").fill("Only my final measurements.");
  await form.getByLabel("I expressly give the optional marketing permissions I selected under this release.").check();
  await form.getByLabel("I am at least 18 and legally able to give this marketing permission.").check();
  await form.getByLabel("Full name for marketing permission").fill("Alex Example");
}
for (const width of [1280, 390, 320]) test(`optional marketing choices save, resume and withdraw at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const id = await signIn(page), form = panel(page);
  for (const checkbox of await form.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Communication", exact: true })).toBeVisible();
  let state = await onboarding.get({ accountId: id }); expect(state.ok && state.value.marketing.record === null).toBe(true);
  await audit(page); await choose(page);
  await form.getByRole("button", { name: "Save marketing choices" }).click();
  await expect(page.getByText("Your optional marketing permission is saved.", { exact: true })).toBeVisible();
  await page.reload(); await audit(page);
  await expect(form.getByLabel("Fitness results and progress measurements", { exact: true })).toBeChecked();
  await expect(form.getByLabel("Paid digital advertising", { exact: true })).not.toBeChecked();
  await expect(form.getByLabel("Include my name", { exact: true })).not.toBeChecked();
  await expect(form.getByLabel("Show my face or other recognisable features", { exact: true })).not.toBeChecked();
  await expect(form.getByLabel("Specific materials or restrictions (optional)")).toHaveValue("Only my final measurements.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await form.getByRole("button", { name: "Withdraw all marketing permission" }).click();
  await expect(form.getByText("Marketing permission withdrawn. No further marketing use is permitted.")).toBeVisible();
  await page.reload(); await audit(page);
  for (const checkbox of await form.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
  state = await onboarding.get({ accountId: id }); expect(state.ok && state.value.answers.questionnaire.belief === onboardingAnswers().questionnaire.belief).toBe(true);
});
test("failed marketing save keeps choices for recovery and unsaved choices can be discarded without opting in", async ({ page }) => {
  await signIn(page); await choose(page);
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Save or discard your optional marketing changes");
  await page.route("**/api/client/onboarding/marketing", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Fixture lost response" } }) }));
  await panel(page).getByRole("button", { name: "Save marketing choices" }).click();
  await expect(page.getByRole("alert")).toContainText("Fixture lost response");
  await expect(panel(page).getByLabel("Full name for marketing permission")).toHaveValue("Alex Example");
  await page.unroute("**/api/client/onboarding/marketing");
  await page.getByRole("button", { name: "Reload saved progress" }).click();
  await expect(panel(page).getByRole("button", { name: "Save marketing choices" })).toBeEnabled();
  await panel(page).getByRole("button", { name: "Discard marketing changes" }).click();
  await expect(panel(page).getByLabel("Fitness results and progress measurements", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Communication", exact: true })).toBeVisible();
});
test("completed assessment stays locked while marketing withdrawal remains available under a new draft", async ({ page }) => {
  const id = await signIn(page);
  for (const slot of mediaSlots(onboardingContent())) {
    const bytes = slot.kind === "video" ? videoBytes : jpegBytes;
    const upload = await media.request({ accountId: id, slot: slot.id, mediaType: slot.kind === "video" ? "video/mp4" : "image/jpeg", size: bytes.length }); if (!upload.ok) throw new Error("Upload failed");
    memory.put(upload.value.id, bytes); expect((await media.finalize({ accountId: id, id: upload.value.id })).ok).toBe(true);
  }
  const booked = await onboarding.recordBooking({ accountId: id, booking: { providerId: randomUUID(), eventVersion: 1, status: "confirmed", startsAt: "2026-11-01T10:00:00Z", timezone: "UTC", meetUrl: "https://meet.google.com/abc-defg-hij" } }); if (!booked.ok) throw new Error("Booking failed");
  expect((await onboarding.complete({ accountId: id, revision: booked.value.revision })).ok).toBe(true);
  await page.reload(); await audit(page); await choose(page);
  await expect(page.getByLabel("I have read the Fitness Participation Agreement, understand the exercise risks and voluntarily give my informed consent to participate.", { exact: true })).toBeDisabled();
  await panel(page).getByRole("button", { name: "Save marketing choices" }).click();
  await expect(page.getByText("Your optional marketing permission is saved.", { exact: true })).toBeVisible();
  expect((await marketing.configure({ release: { ...release, version: "browser-marketing-v2-draft", approved: false } })).ok).toBe(true);
  await page.reload(); await audit(page);
  await expect(panel(page).getByLabel("Fitness results and progress measurements", { exact: true })).toBeDisabled();
  await expect(panel(page).getByRole("button", { name: "Withdraw all marketing permission" })).toBeEnabled();
  await panel(page).getByRole("button", { name: "Withdraw all marketing permission" }).click();
  await expect(panel(page).getByText("Marketing permission withdrawn. No further marketing use is permitted.")).toBeVisible();
  const history = await marketing.history({ accountId: id }); expect(history.ok && history.value.map(r => r.action)).toEqual(["withdrawn", "granted"]);
  const state = await onboarding.get({ accountId: id }); expect(state.ok && state.value.completedAt).toBeTruthy();
  expect((await marketing.save({ accountId: id, revision: 2, permission: emptyMarketingPermission("browser-marketing-v2-draft") })).ok).toBe(true);
  await page.goto(app.origin); await expect(page).toHaveURL(app.origin + "/");
});
