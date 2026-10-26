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
async function signIn(page: Page, complete = true) {
  const email = `marketing-browser-${randomUUID()}@example.test`;
  const provisioned = await app.auth.provisionAccount({ email }); if (!provisioned.ok) throw new Error("Provisioning failed");
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const signed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); if (!signed.ok) throw new Error("Sign-in failed");
  const id = provisioned.value.id;
  expect((await onboarding.save({ accountId: id, revision: 0, contentVersion: onboardingContent().version, answers: onboardingAnswers() })).ok).toBe(true);
  if (complete) {
    for (const slot of mediaSlots(onboardingContent())) {
      const bytes = slot.kind === "video" ? videoBytes : jpegBytes;
      const upload = await media.request({ accountId: id, slot: slot.id, mediaType: slot.kind === "video" ? "video/mp4" : "image/jpeg", size: bytes.length }); if (!upload.ok) throw new Error("Upload failed");
      memory.put(upload.value.id, bytes); expect((await media.finalize({ accountId: id, id: upload.value.id })).ok).toBe(true);
    }
    const booked = await onboarding.recordBooking({ accountId: id, booking: { providerId: randomUUID(), eventVersion: 1, status: "confirmed", startsAt: "2026-11-01T10:00:00Z", timezone: "UTC", meetUrl: "https://meet.google.com/abc-defg-hij" } }); if (!booked.ok) throw new Error("Booking failed");
    expect((await onboarding.complete({ accountId: id, revision: booked.value.revision })).ok).toBe(true);
  }
  await page.context().addCookies([{ name: "ebs-session", value: signed.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  await page.route("https://example.test/**", route => route.fulfill({ status: 200, body: "" }));
  await page.goto(app.origin + (complete ? "/" : "/onboarding"));
  return id;
}
async function invite(accountId: string, withPhoto = false) {
  const state = await onboarding.get({ accountId }); if (!state.ok) throw new Error("Read failed");
  const photo = state.value.media.find(item => item.slot === "photo:front");
  const result = await marketing.requestStory({ accountId, story: { title: "My first strong month", results: "I completed four weeks of consistent training.", testimonial: "I feel stronger and more confident.", mediaIds: withPhoto && photo ? [photo.id] : [] } });
  expect(result.ok).toBe(true); return result;
}
function panel(page: Page) { return page.getByRole("region", { name: "Optional marketing permission" }); }
async function choose(page: Page) {
  await panel(page).getByLabel("EBS websites and landing pages", { exact: true }).check();
  await panel(page).getByRole("checkbox", { name: /^I expressly approve this story/ }).check();
}
test("onboarding contains no media request and a new client has no story invitation", async ({ page }) => {
  const id = await signIn(page, false);
  await expect(page.locator(".ob-main > fieldset.ob-fields")).toBeVisible();
  const menu = page.locator(".ob-nav-mobile");
  if (await menu.isVisible() && await menu.getAttribute("open") === null) await menu.locator("summary").click();
  await page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Fitness Participation Agreement/ }).click();
  await expect(page.getByRole("heading", { name: "Fitness Participation Agreement", exact: true })).toBeVisible();
  await expect(panel(page)).toHaveCount(0); await expect(page.getByText("Media & Testimonial Release", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Communication", exact: true })).toBeVisible();
  expect(await marketing.notice({ accountId: id })).toEqual({ ok: true, value: { pending: false } });
  await page.goto(app.origin + "/account/media"); await expect(page.getByText("There is nothing to approve now.", { exact: false })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Approve this story" })).toHaveCount(0);
});
for (const width of [1280, 390, 320]) test(`specific milestone story approval and withdrawal at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const id = await signIn(page);
  await expect(page.getByRole("region", { name: "Progress story invitation" })).toHaveCount(0);
  const offered = await invite(id, true); if (!offered.ok) throw new Error("Invite failed");
  await page.reload(); await page.getByRole("link", { name: "Review my story · optional", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Media preferences", exact: true })).toBeVisible();
  await expect(page.getByText("I completed four weeks of consistent training.", { exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Review photo or video 1" })).toBeVisible();
  for (const checkbox of await panel(page).getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
  await choose(page); await panel(page).getByRole("button", { name: "Approve this story" }).click();
  await expect(page.getByText("Your optional marketing permission is saved.", { exact: true })).toBeVisible();
  await page.reload(); await expect(panel(page).getByRole("button", { name: "Withdraw all marketing permission" })).toBeVisible();
  const state = await onboarding.get({ accountId: id }); expect(state.ok && state.value.marketing.record?.story?.id).toBe(offered.value.id);
  expect(state.ok && state.value.marketing.record?.permission.choices.paidAds).toBe(false);
  expect(state.ok && state.value.marketing.record?.permission.choices.showFace).toBe(false);
  expect(state.ok && state.value.marketing.record?.permission.signedName).toBe("Alex Example");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel(page).getByRole("button", { name: "Withdraw all marketing permission" }).click();
  await expect(panel(page).getByText("Marketing permission withdrawn. No further marketing use is permitted.")).toBeVisible();
  await page.goto(app.origin); await expect(page.getByRole("region", { name: "Progress story invitation" })).toHaveCount(0);
});
test("failed story approval retains choices for reload and recovery", async ({ page }) => {
  const id = await signIn(page); await invite(id); await page.goto(app.origin + "/account/media");
  await expect(panel(page).getByRole("button", { name: "Approve this story" })).toBeVisible(); await choose(page);
  await page.route("**/api/client/onboarding/marketing", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Fixture lost response" } }) }));
  await panel(page).getByRole("button", { name: "Approve this story" }).click(); await expect(page.getByRole("alert")).toContainText("Fixture lost response");
  await page.unroute("**/api/client/onboarding/marketing"); await page.getByRole("button", { name: "Reload saved progress" }).click();
  await expect(panel(page).getByRole("checkbox", { name: /^I expressly approve this story/ })).toBeChecked();
  await panel(page).getByRole("button", { name: "Approve this story" }).click(); await expect(page.getByText("Your optional marketing permission is saved.", { exact: true })).toBeVisible();
});
test("earlier permissions remain withdrawable before setup and under an unapproved replacement", async ({ page }) => {
  const id = await signIn(page, false);
  const permission = { ...emptyMarketingPermission(release.version), choices: { ...emptyMarketingPermission().choices, results: true, website: true }, accepted: true, adult: true, signedName: "Alex Example" };
  await sql`insert into onboarding_marketing_permissions (id, account_id, revision, data) values (${randomUUID()}, ${id}, 1, cast(${JSON.stringify({ action: "granted", permission, release })} as jsonb))`.execute(db);
  expect((await marketing.configure({ release: { ...release, version: "browser-marketing-revised-draft", approved: false } })).ok).toBe(true);
  await page.goto(app.origin + "/account/media"); await expect(panel(page).getByRole("button", { name: "Withdraw all marketing permission" })).toBeEnabled();
  await panel(page).getByRole("button", { name: "Withdraw all marketing permission" }).click();
  await expect(panel(page).getByText("Marketing permission withdrawn. No further marketing use is permitted.")).toBeVisible();
  const history = await marketing.history({ accountId: id }); expect(history.ok && history.value.map(record => record.action)).toEqual(["withdrawn", "granted"]);
});
