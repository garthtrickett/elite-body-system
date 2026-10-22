import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createOnboarding, createAssessmentMedia, mediaSlots } from "../../src/features/onboarding/index.ts";
import { SECTIONS, SECTION_LABELS } from "../../src/features/onboarding/data.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { onboardingContent, onboardingAnswers, memoryAssessmentStorage, jpegBytes, videoBytes } from "../support/onboarding.ts";

const db = createDatabase(testDatabaseUrl()), onboarding = createOnboarding({ db }), memory = memoryAssessmentStorage();
let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp({ onboardingEnabled: true, assessmentStorage: memory.storage }); expect((await onboarding.configure({ content: onboardingContent() })).ok).toBe(true); });
test.afterAll(async () => { await app.close(); await db.destroy(); });
async function signIn(page: Page, seeded = false) {
  const email = `harry-setup-${randomUUID()}@example.test`;
  const provisioned = await app.auth.provisionAccount({ email }); if (!provisioned.ok) throw new Error("Provisioning failed");
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const redeemed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); if (!redeemed.ok) throw new Error("Sign-in failed");
  if (seeded) expect((await onboarding.save({ accountId: provisioned.value.id, revision: 0, contentVersion: onboardingContent().version, answers: onboardingAnswers() })).ok).toBe(true);
  await page.context().addCookies([{ name: "ebs-session", value: redeemed.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  await page.route("https://example.test/**", route => route.fulfill({ status: 200, body: "" }));
  await page.goto(app.origin); await expect(page).toHaveURL(app.origin + "/onboarding");
  await expect(page.getByRole("heading", { name: "Welcome", exact: true })).toBeVisible();
  return provisioned.value.id;
}
async function section(page: Page, key: typeof SECTIONS[number]) {
  const mobile = page.locator(".ob-nav-mobile");
  if (await mobile.isVisible() && await mobile.getAttribute("open") === null) await mobile.locator("summary").click();
  const button = page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: new RegExp(SECTION_LABELS[key]) });
  const current = await button.getAttribute("aria-current"); await button.click();
  const heading = page.getByRole("heading", { name: SECTION_LABELS[key], exact: true });
  if (current !== "step") await expect(heading).toBeFocused(); else await expect(heading).toBeVisible();
}
test("all eight onboarding sections reflow at narrow, landscape and desktop sizes, save progress and keep dashboard locked", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page);
  await expect(page.locator(".ob-nav-mobile")).not.toHaveAttribute("open");
  await page.screenshot({ path: info.outputPath("390-first-impression.png"), fullPage: true });
  await page.getByLabel("What should Harry call you?").fill("Taylor");
  const timezone = page.getByLabel("Your time zone (for example Europe/London)");
  await timezone.clear(); await timezone.pressSequentially("Europe/London"); await expect(timezone).toHaveValue("Europe/London");
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("What should Harry call you?")).toHaveValue("Taylor");
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    for (const key of SECTIONS) {
      await section(page, key); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${viewport.width}-${key}.png`), fullPage: true });
    }
  }
  await page.getByRole("button", { name: "Finish onboarding", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("remaining requirements");
  await page.goto(app.origin + "/training"); await expect(page).toHaveURL(app.origin + "/onboarding");
  expect(errors).toEqual([]);
});

test("a fully submitted assessment with a confirmed booking finishes onboarding and opens the dashboard", async ({ page }) => {
  const accountId = await signIn(page, true), media = createAssessmentMedia({ db, storage: memory.storage });
  for (const slot of mediaSlots(onboardingContent())) {
    const bytes = slot.kind === "video" ? videoBytes : jpegBytes;
    const requested = await media.request({ accountId, slot: slot.id, mediaType: slot.kind === "video" ? "video/mp4" : "image/jpeg", size: bytes.length });
    if (!requested.ok) throw new Error(requested.error.message);
    memory.put(requested.value.id, bytes); expect((await media.finalize({ accountId, id: requested.value.id })).ok).toBe(true);
  }
  expect((await onboarding.recordBooking({ accountId, booking: { providerId: randomUUID(), eventVersion: 1, status: "confirmed", startsAt: "2026-11-01T10:00:00Z", timezone: "Europe/London", meetUrl: "https://meet.google.com/abc-defg-hij" } })).ok).toBe(true);
  await page.reload(); await section(page, "call");
  await expect(page.getByRole("heading", { name: "Booking confirmed", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish onboarding", exact: true }).click();
  await expect(page).toHaveURL(app.origin + "/");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("goal ranking supports keyboard controls and preserves order after saving and reloading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, true); await section(page, "questionnaire");
  const up = page.getByRole("button", { name: "Move Strength up", exact: true }); await up.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".ob-rank-name").first()).toHaveText("1. Strength");
  await expect(page.getByRole("button", { name: "Reorder Strength with arrow keys or drag", exact: true })).toBeFocused();
  await expect(page.getByLabel("This is my preferred goal order.")).not.toBeChecked();
  await page.getByLabel("This is my preferred goal order.").check();
  await page.getByRole("button", { name: "Save progress", exact: true }).click(); await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await section(page, "questionnaire"); await expect(page.locator(".ob-rank-name").first()).toHaveText("1. Strength");
});
test("onboarding sign-out failures remain visible and cancelling a dirty exit retains the answers", async ({ page }) => {
  await signIn(page, true);
  let calls = 0;
  await page.route("**/api/auth/sign-out", async route => { calls++; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable" } }) }); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn’t confirm sign-out. Please try again.");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  await page.getByLabel("What should Harry call you?").fill("Unsaved name");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("What should Harry call you?")).toHaveValue("Unsaved name"); expect(calls).toBe(1);
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
});
test("cancelling an upload during a failed answer-save preserves the draft for a successful retry", async ({ page }) => {
  await signIn(page, true); await section(page, "measurements");
  await page.getByLabel("Waistline (cm)", { exact: true }).fill("81");
  let release: (() => void) | undefined, entered: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; }), saving = new Promise<void>(resolve => { entered = resolve; });
  await page.route("**/api/client/onboarding/save", async route => { entered?.(); await held; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Fixture failed save" } }) }); });
  await page.getByLabel("Upload front photo", { exact: true }).setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: jpegBytes });
  await saving; await page.getByRole("button", { name: "Cancel upload", exact: true }).click(); release?.();
  await expect(page.getByText("Upload cancelled. Check your answers and save any remaining changes.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Waistline (cm)", { exact: true })).toHaveValue("81"); await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.unroute("**/api/client/onboarding/save");
  await page.getByRole("button", { name: "Save progress", exact: true }).click(); await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await section(page, "measurements"); await expect(page.getByLabel("Waistline (cm)", { exact: true })).toHaveValue("81");
});
test("mobile assessment uploads persist only after verification, and booking links cannot unlock the dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, true);
  await page.route("https://uploads.example.test/*", async route => {
    const headers = { "Access-Control-Allow-Origin": app.origin, "Access-Control-Allow-Methods": "PUT, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const id = route.request().url().split("/").at(-1)!, bytes = route.request().postDataBuffer(); if (!bytes) throw new Error("Missing upload body");
    memory.put(id, bytes); await route.fulfill({ status: 200, headers, body: "" });
  });
  await section(page, "measurements");
  await page.getByLabel("Upload front photo", { exact: true }).setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: jpegBytes });
  await expect(page.getByRole("button", { name: "Download front photo", exact: true })).toBeVisible();
  await page.reload(); await section(page, "measurements"); await expect(page.getByRole("button", { name: "Download front photo", exact: true })).toBeVisible();
  await section(page, "call"); await expect(page.getByRole("link", { name: "Choose a call time ↗" })).toHaveAttribute("href", onboardingContent().bookingUrl);
  await page.getByRole("button", { name: "Refresh confirmation", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("not connected");
  await page.goto(app.origin); await expect(page).toHaveURL(app.origin + "/onboarding");
});
