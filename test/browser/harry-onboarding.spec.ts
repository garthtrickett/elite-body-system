import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createOnboarding, createAssessmentMedia, mediaSlots, DRAFT_HEALTH_SAFETY } from "../../src/features/onboarding/index.ts";
import { SECTIONS, SECTION_LABELS, QUESTIONS } from "../../src/features/onboarding/data.ts";
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
  await expect(page.getByRole("heading", { name: "Welcome video", exact: true })).toBeVisible();
  return provisioned.value.id;
}
async function section(page: Page, key: typeof SECTIONS[number]) {
  // Loading the saved snapshot closes the phone menu; wait before opening it.
  await expect(page.locator(".ob-main > fieldset.ob-fields")).toBeVisible();
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
  await page.getByRole("button", { name: "Complete", exact: true }).click();
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
  const legacyGoals = ["cardio", "size", "strength", "reduce-pain", "mobility", "get-lean", "energy"];
  await sql`update onboarding_records set data = jsonb_set(data #- '{answers,questionnaire,finalThought}' #- '{answers,questionnaire,belief}', '{answers,goals}', cast(${JSON.stringify(legacyGoals)} as jsonb)) where account_id = ${accountId}`.execute(db);
  await page.goto(app.origin + "/onboarding"); await section(page, "questionnaire");
  const finalThought = page.getByLabel("What was the final thought that made you decide to sign up?", { exact: true });
  await expect(finalThought).toHaveValue(""); await expect(finalThought).toBeDisabled();
  await expect(page.getByLabel(QUESTIONS.belief, { exact: true })).toHaveValue("");
  await expect(page.getByLabel(QUESTIONS.belief, { exact: true })).toBeDisabled();
  await expect(page.locator(".ob-rank-name").first()).toHaveText("1. Get Cardio Fit");
  await expect(page.getByLabel("This is my preferred goal order.")).not.toBeChecked();
  await expect(page.getByLabel("This is my preferred goal order.")).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Start Point Form/ })).toContainText("✓");
  await page.goto(app.origin + "/"); await expect(page).toHaveURL(app.origin + "/");
});
test("Health & Safety Agreement presents the online-system draft without recording an unapproved signature", async ({ page }) => {
  try {
    expect((await onboarding.configure({ content: { ...onboardingContent(), ...DRAFT_HEALTH_SAFETY, version: "health-safety-draft-browser" } })).ok).toBe(true);
    const accountId = await signIn(page);
    await section(page, "audit");
    await expect(page.getByRole("heading", { name: "Health & Safety Agreement", exact: true })).toBeVisible();
    await expect(page.getByText(/Draft for review\. This agreement is not available for signing yet/)).toBeVisible();
    await expect(page.getByText(DRAFT_HEALTH_SAFETY.consentText, { exact: true })).toBeVisible();
    await expect(page.getByLabel("I have read and agree to the Health & Safety Agreement.", { exact: true })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /^I explicitly consent to Elite Body System/ })).toBeDisabled();
    await expect(page.getByLabel("Full name for consent", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Yes", exact: true })).toHaveCount(7);
    for (const button of await page.getByRole("button", { name: "Yes", exact: true }).all()) await expect(button).toBeDisabled();
    await expect(page.getByLabel("Upload push-ups", { exact: true })).toHaveCount(0);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    const saved = await onboarding.get({ accountId }); if (!saved.ok) throw new Error("Draft onboarding read failed");
    expect(saved.value.consentSignedAt).toBeNull(); expect(saved.value.completedAt).toBeNull();
  } finally { await onboarding.configure({ content: onboardingContent() }); }
});
test("Welcome completion saves before showing its check and keeps it after revisiting and reloading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page);
  const welcome = page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Welcome video/ });
  await page.getByLabel("What should Harry call you?", { exact: true }).fill("Taylor");
  await page.getByLabel("I’ve watched or read this guidance and understand what to do.", { exact: true }).check();
  await expect(welcome).not.toContainText("✓");
  await expect(page.getByRole("button", { name: "Save progress", exact: true })).toHaveCount(0);
  let saves = 0;
  page.on("request", request => { if (request.url().endsWith("/api/client/onboarding/save") && request.method() === "POST") saves++; });
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start Point Form", exact: true })).toBeVisible();
  expect(saves).toBe(1); await expect(welcome).toContainText("✓");
  await section(page, "welcome"); await expect(welcome).toContainText("✓");
  await page.reload(); await expect(welcome).toContainText("✓");
  await expect(page.getByLabel("What should Harry call you?", { exact: true })).toHaveValue("Taylor");
  await expect(page.getByLabel("I’ve watched or read this guidance and understand what to do.", { exact: true })).toBeChecked();
});
for (const width of [1280, 390, 320]) test(`health screening comes first and holds concerning answers until physician clearance at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const accountId = await signIn(page, true); await section(page, "audit");
  const headings = await page.locator(".ob-main > fieldset > section > h2").allTextContents();
  expect(headings.slice(0, 2)).toEqual(["Health screening", "Your participation agreement"]);
  const screening = page.getByRole("region", { name: "Health screening", exact: true });
  await screening.getByRole("button", { name: "Yes", exact: true }).first().click();
  const explanation = page.getByLabel("Briefly explain your Yes answers in a short sentence", { exact: true });
  const clearance = page.getByLabel("I confirm that a registered physician has medically cleared me for physical activity in light of the health concerns I have disclosed.", { exact: true });
  await expect(explanation).toBeVisible(); await expect(clearance).not.toBeChecked();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("short sentence");
  await expect(page.getByRole("heading", { name: "Health & Safety Agreement", exact: true })).toBeVisible();
  await explanation.fill("My registered physician reviewed my blood pressure.");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("registered physician");
  await page.reload(); await section(page, "audit");
  await expect(explanation).toHaveValue("My registered physician reviewed my blood pressure."); await expect(clearance).not.toBeChecked();
  const menu = page.locator(".ob-nav-mobile");
  if (await menu.isVisible() && await menu.getAttribute("open") === null) await menu.locator("summary").click();
  await page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Communication/ }).click();
  await expect(page.getByRole("alert")).toContainText("registered physician");
  if (await menu.isVisible() && await menu.getAttribute("open") !== null) await menu.locator("summary").click();
  await clearance.check(); await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Communication", exact: true })).toBeVisible();
  const stored = await onboarding.get({ accountId }); expect(stored.ok && stored.value.answers.medicalClearance).toBe(true);
  await page.reload(); await section(page, "audit"); await expect(clearance).toBeChecked();
  await explanation.fill("My symptoms have changed."); await expect(clearance).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Start Point Form places questions around full-width goal cards and saves their dragged order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await signIn(page, true); await section(page, "questionnaire");
  const labels = await page.locator(".ob-main > .ob-fields").evaluate(form => [...form.children].flatMap(child => {
    const label = child.querySelector(".sc-label"); return label ? [label.textContent] : [];
  }));
  expect(labels).toEqual([
    "What would be an incredible result for you over the next 180 days? What do you want to achieve?",
    "What are your main reasons for doing this now? Your “WHY”?",
    "What motivates you to stay committed to your fitness to achieve that result?",
    "What in particular struggles need solving to achieve your desired result?",
    "Rank your fitness goals in priority order",
    "Why did you choose EBS to solve this over other options?",
    "What was the final thought that made you decide to sign up?",
    "What previous experience do you have with personal training or fitness programs and why did you stop?",
    "When have you succeeded physically in the past, and what made you succeed?",
    "Do you believe you're capable of achieving and maintaining Elite Body composition and Physical Performance for your age? If not, why not? If yes, why yes?",
  ]);
  await expect(page.locator(".ob-rank-name")).toHaveText([
    "1. Mobility", "2. Strength", "3. Gain muscle", "4. Energy", "5. Get Cardio Fit", "6. Get lean", "7. Reduce pain", "8. Consistency", "9. Improve health markers", "10. Mental wellness",
  ]);
  await page.locator('[data-goal="strength"] .ob-rank-handle').dragTo(page.locator('[data-goal="mobility"]'));
  await expect(page.locator(".ob-rank-name").first()).toHaveText("1. Strength");
  await expect(page.getByLabel("This is my preferred goal order.")).not.toBeChecked();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await page.locator(".ob-ranking").evaluate(list => [...list.children].map(card => ({ list: list.getBoundingClientRect().width, card: card.getBoundingClientRect().width })));
    for (const size of sizes) expect(Math.abs(size.list - size.card)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Move Improve health markers up", exact: true }).click();
  await page.getByRole("button", { name: "Move Mental wellness up", exact: true }).click();
  const rankedLabels = ["1. Strength", "2. Mobility", "3. Gain muscle", "4. Energy", "5. Get Cardio Fit", "6. Get lean", "7. Reduce pain", "8. Improve health markers", "9. Mental wellness", "10. Consistency"];
  await expect(page.locator(".ob-rank-name")).toHaveText(rankedLabels);
  await page.getByLabel("This is my preferred goal order.").check();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: SECTION_LABELS.audit, exact: true })).toBeVisible();
  await page.reload(); await section(page, "questionnaire");
  await expect(page.locator(".ob-rank-name")).toHaveText(rankedLabels);
  await expect(page.getByLabel("This is my preferred goal order.")).toBeChecked();
});
test("the final belief question resumes unanswered older forms and autosaves on desktop and phone", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const accountId = await signIn(page, true);
    await sql`update onboarding_records set data = data #- '{answers,questionnaire,belief}' where account_id = ${accountId}`.execute(db);
    await page.reload(); await section(page, "questionnaire");
    if (width === 390) await page.locator(".ob-nav-mobile > summary").click();
    const belief = page.getByLabel(QUESTIONS.belief, { exact: true });
    const nav = page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Start Point Form/ });
    await expect(belief).toHaveValue(""); await expect(nav).not.toContainText("✓");
    const answer = "Yes, because I can follow a consistent plan and ask for support.";
    await belief.fill(answer);
    await expect(page.getByTestId("onboarding-save-status")).toHaveText("Progress saved to your account");
    await expect(nav).toContainText("✓");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload(); await section(page, "questionnaire");
    if (width === 390) await page.locator(".ob-nav-mobile > summary").click();
    await expect(belief).toHaveValue(answer); await expect(nav).toContainText("✓");
    await expect(page.getByLabel(QUESTIONS.success, { exact: true })).toHaveValue(onboardingAnswers().questionnaire.success);
  }
});
test("goal ranking supports keyboard controls and preserves order after saving and reloading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, true); await section(page, "questionnaire");
  const up = page.getByRole("button", { name: "Move Strength up", exact: true }); await up.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".ob-rank-name").first()).toHaveText("1. Strength");
  await expect(page.getByRole("button", { name: "Reorder Strength with arrow keys or drag", exact: true })).toBeFocused();
  await expect(page.getByLabel("This is my preferred goal order.")).not.toBeChecked();
  await page.getByLabel("This is my preferred goal order.").check();
  await page.getByRole("button", { name: "Complete", exact: true }).click(); await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Complete", exact: true }).click();
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
  await expect(page.getByLabel("Waistline (cm)", { exact: true })).toHaveValue("81"); await expect(page.getByText("Complete this section to save your changes.", { exact: true })).toBeVisible();
  await page.unroute("**/api/client/onboarding/save");
  await page.getByRole("button", { name: "Complete", exact: true }).click(); await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await section(page, "measurements"); await expect(page.getByLabel("Waistline (cm)", { exact: true })).toHaveValue("81");
});

test("earlier-version photos stay discoverable and removable without completing the current assessment", async ({ page }) => {
  try {
    const accountId = await signIn(page, true), media = createAssessmentMedia({ db, storage: memory.storage });
    const requested = await media.request({ accountId, slot: "photo:front", mediaType: "image/jpeg", size: jpegBytes.length });
    expect(requested.ok).toBe(true); if (!requested.ok) throw new Error("Upload fixture failed");
    memory.put(requested.value.id, jpegBytes); expect((await media.finalize({ accountId, id: requested.value.id })).ok).toBe(true);
    expect((await onboarding.configure({ content: { ...onboardingContent(), version: `browser-${randomUUID()}` } })).ok).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await section(page, "measurements");
    await expect(page.getByRole("region", { name: "Earlier submissions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download earlier front photo", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Remove earlier front photo", exact: true }).click();
    await expect(page.getByRole("region", { name: "Earlier submissions" })).toHaveCount(0);
    expect((await onboarding.get({ accountId })).ok).toBe(true);
  } finally { await onboarding.configure({ content: onboardingContent() }); }
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

test("Continue advances incomplete sections and final validation keeps focus through questionnaire corrections", async ({ page }) => {
  await signIn(page, true); await section(page, "measurements");
  const waist = page.getByRole("textbox", { name: /^Waistline \(cm\)/ });
  await waist.fill(""); await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: SECTION_LABELS.lifestyle, exact: true })).toBeFocused();
  await section(page, "questionnaire");
  const answer = page.getByLabel("What would be an incredible result for you over the next 180 days? What do you want to achieve?", { exact: true });
  await answer.fill(""); await page.getByLabel(QUESTIONS.motivation, { exact: true }).fill(""); await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: SECTION_LABELS.audit, exact: true })).toBeFocused();
  await section(page, "call"); await page.getByRole("button", { name: "Finish onboarding", exact: true }).click();
  await expect(page.locator(".ob-feedback")).toBeFocused(); await expect(answer).toHaveAttribute("aria-invalid", "true");
  await answer.click(); await answer.pressSequentially("A stronger body", { delay: 15 });
  await expect(page.getByTestId("onboarding-save-status")).toHaveText("Progress saved to your account");
  await expect(answer).toHaveValue("A stronger body"); await expect(answer).toBeFocused();
});

test("a failed save can reconcile and retry without discarding the client’s unsaved answers", async ({ page }) => {
  await signIn(page, true);
  const name = page.getByLabel("What should Harry call you?", { exact: true }); await name.fill("Important unsaved name");
  await page.route("**/api/client/onboarding/save", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Fixture temporary outage" } }) }));
  await page.getByRole("button", { name: "Complete", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("temporary outage");
  await page.unroute("**/api/client/onboarding/save"); await page.getByRole("button", { name: "Reload saved progress", exact: true }).click();
  await expect(name).toHaveValue("Important unsaved name"); await expect(name).toBeEnabled();
  await page.getByRole("button", { name: "Complete", exact: true }).click(); await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await expect(name).toHaveValue("Important unsaved name");
});

test("cancelling held upload authorization waits for cleanup before reporting cancellation", async ({ page }) => {
  const accountId = await signIn(page, true); await section(page, "measurements");
  let release: () => void = () => {}, reached: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), requested = new Promise<void>(resolve => { reached = resolve; });
  await page.route("**/api/client/onboarding/media/request", async route => { reached(); await held; await route.continue(); });
  try {
    await page.getByLabel("Upload front photo", { exact: true }).setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: jpegBytes });
    await requested; await page.getByRole("button", { name: "Cancel upload", exact: true }).click();
    await expect(page.getByText("Cancelling upload…", { exact: true })).toBeVisible(); release();
    await expect(page.getByText("Upload cancelled. Check your answers and save any remaining changes.", { exact: true })).toBeVisible();
    const current = await onboarding.get({ accountId }); expect(current.ok).toBe(true);
    if (current.ok) expect(current.value.media).toHaveLength(0);
    await page.reload(); await section(page, "measurements"); await expect(page.getByRole("button", { name: "Remove front photo", exact: true })).toHaveCount(0);
  } finally { release(); }
});

test("finalization is visibly noncancellable and the committed upload appears when it finishes", async ({ page }) => {
  await signIn(page, true); await section(page, "measurements");
  await page.route("https://uploads.example.test/*", async route => {
    const headers = { "Access-Control-Allow-Origin": app.origin, "Access-Control-Allow-Methods": "PUT, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const bytes = route.request().postDataBuffer(); if (!bytes) throw new Error("Missing upload fixture");
    memory.put(route.request().url().split("/").at(-1)!, bytes); await route.fulfill({ status: 200, headers, body: "" });
  });
  let release: () => void = () => {}, reached: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), finalizing = new Promise<void>(resolve => { reached = resolve; });
  await page.route("**/api/client/onboarding/media/finalize", async route => { reached(); await held; await route.continue(); });
  try {
    await page.getByLabel("Upload front photo", { exact: true }).setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: jpegBytes });
    await finalizing; await expect(page.getByRole("button", { name: "Finishing upload…", exact: true })).toBeDisabled();
    release(); await expect(page.getByRole("button", { name: "Download front photo", exact: true })).toBeVisible();
    await expect(page.getByText(/Upload cancelled\./)).toHaveCount(0);
  } finally { release(); }
});

test("a rejected replacement cleans up its pending file and preserves the previous ready submission", async ({ page }) => {
  const accountId = await signIn(page, true), media = createAssessmentMedia({ db, storage: memory.storage });
  const requested = await media.request({ accountId, slot: "photo:front", mediaType: "image/jpeg", size: jpegBytes.length });
  expect(requested.ok).toBe(true); if (!requested.ok) throw new Error("Upload fixture failed");
  memory.put(requested.value.id, jpegBytes); expect((await media.finalize({ accountId, id: requested.value.id })).ok).toBe(true);
  await page.route("https://uploads.example.test/*", async route => {
    const headers = { "Access-Control-Allow-Origin": app.origin, "Access-Control-Allow-Methods": "PUT, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const bytes = route.request().postDataBuffer(); if (!bytes) throw new Error("Missing upload fixture");
    memory.put(route.request().url().split("/").at(-1)!, bytes); await route.fulfill({ status: 200, headers, body: "" });
  });
  await page.reload(); await section(page, "measurements");
  await page.getByLabel("Upload front photo", { exact: true }).setInputFiles({ name: "invalid.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(20) });
  await expect(page.getByRole("alert")).toContainText("does not match");
  await expect(page.getByRole("button", { name: "Download front photo", exact: true })).toBeEnabled();
  const current = await onboarding.get({ accountId }); expect(current.ok).toBe(true);
  if (current.ok) { expect(current.value.media).toHaveLength(1); expect(current.value.media[0]?.id).toBe(requested.value.id); expect(current.value.media[0]?.status).toBe("ready"); }
});


test("questionnaire answers and confirmed goal order autosave without interrupting desktop or phone typing", async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); const accountId = await signIn(page, true); await section(page, "questionnaire");
    const answer = page.getByLabel("What would be an incredible result for you over the next 180 days? What do you want to achieve?", { exact: true });
    await answer.fill(`A stronger body at ${width} `);
    await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible(); await expect(answer).toBeFocused();
    await expect(answer).toHaveValue(`A stronger body at ${width} `); await answer.pressSequentially("with Harry");
    await expect(page.getByTestId("onboarding-save-status")).toHaveText("Progress saved to your account");
    const saved = await onboarding.get({ accountId }); if (!saved.ok) throw new Error("Questionnaire read failed");
    expect(saved.value.answers.questionnaire.transformation).toBe(`A stronger body at ${width} with Harry`);
    await page.getByRole("button", { name: "Move Strength up", exact: true }).click();
    await page.getByLabel("This is my preferred goal order.").check();
    await expect(page.getByTestId("onboarding-save-status")).toHaveText("Progress saved to your account");
    await page.reload(); await section(page, "questionnaire");
    await expect(answer).toHaveValue(`A stronger body at ${width} with Harry`); await expect(page.locator(".ob-rank-name").first()).toHaveText("1. Strength");
    await expect(page.getByLabel("This is my preferred goal order.")).toBeChecked();
    await page.screenshot({ path: info.outputPath(`questionnaire-autosaved-${width}.png`) });
  }
});

test("Continue during a held autosave flushes newer answers before showing the next section", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); const accountId = await signIn(page, true); await section(page, "questionnaire");
    let release: () => void = () => {}, entered: () => void = () => {}, calls = 0;
    const hold = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { entered = resolve; });
    const count = (request: import("@playwright/test").Request) => { if (request.url().endsWith("/api/client/onboarding/save")) calls++; };
    page.on("request", count);
    await page.route("**/api/client/onboarding/save", async route => { const response = await route.fetch(); entered(); await hold; await route.fulfill({ response }); }, { times: 1 });
    try {
      const answer = page.getByLabel("What would be an incredible result for you over the next 180 days? What do you want to achieve?", { exact: true });
      await answer.fill("First answer"); await reached; await expect(answer).toBeEnabled();
      await answer.fill("Latest answer before Continue"); await page.getByRole("button", { name: "Complete", exact: true }).click();
      await expect(answer).toBeDisabled(); await expect(page.getByRole("heading", { name: SECTION_LABELS.questionnaire, exact: true })).toBeVisible();
      release(); await expect(page.getByRole("heading", { name: SECTION_LABELS.audit, exact: true })).toBeFocused();
      const saved = await onboarding.get({ accountId }); if (!saved.ok) throw new Error("Saved questionnaire unavailable");
      expect(saved.value.answers.questionnaire.transformation).toBe("Latest answer before Continue"); expect(calls).toBe(2);
      await section(page, "questionnaire"); await expect(answer).toHaveValue("Latest answer before Continue");
    } finally { release(); page.off("request", count); await page.unroute("**/api/client/onboarding/save"); }
  }
});

test("a failed questionnaire autosave keeps the draft and section until recovery saves it", async ({ page }) => {
  const accountId = await signIn(page, true); await section(page, "questionnaire");
  await page.route("**/api/client/onboarding/save", route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Autosave is temporarily unavailable" } } }), { times: 1 });
  const answer = page.getByLabel("What would be an incredible result for you over the next 180 days? What do you want to achieve?", { exact: true });
  await answer.fill("Keep this important answer");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable"); await expect(answer).toHaveValue("Keep this important answer");
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reload saved progress", exact: true }).click();
  await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  const saved = await onboarding.get({ accountId }); if (!saved.ok) throw new Error("Autosave retry read failed");
  expect(saved.value.answers.questionnaire.transformation).toBe("Keep this important answer");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: SECTION_LABELS.audit, exact: true })).toBeFocused();
});

test("Continue follows all eight sections with unfinished content while Finish keeps the dashboard locked", async ({ page }) => {
  try {
    expect((await onboarding.configure({ content: { ...onboardingContent(), version: "browser-unconfigured", approved: false, welcomeVideo: "", consentText: "", measurementVideo: "", bookingUrl: "" } })).ok).toBe(true);
    const accountId = await signIn(page);
    for (const key of SECTIONS.slice(1)) {
      await page.getByRole("button", { name: "Complete", exact: true }).click();
      await expect(page.getByRole("heading", { name: SECTION_LABELS[key], exact: true })).toBeFocused();
    }
    await expect(page.getByText("0 of 8 sections ready", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Finish onboarding", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("remaining requirements");
    const saved = await onboarding.get({ accountId }); if (!saved.ok) throw new Error("Onboarding read failed"); expect(saved.value.completedAt).toBeNull();
    await page.goto(app.origin + "/training"); await expect(page).toHaveURL(app.origin + "/onboarding");
  } finally { await onboarding.configure({ content: onboardingContent() }); }
});

test("an uncertain autosave preserves the latest reverted answer through recovery and persistence", async ({ page }) => {
  const accountId = await signIn(page, true); await section(page, "questionnaire");
  const answer = page.getByLabel(QUESTIONS.transformation, { exact: true }), original = await answer.inputValue();
  let release: () => void = () => {}, entered: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { entered = resolve; });
  await page.route("**/api/client/onboarding/save", async route => {
    const committed = await route.fetch(); expect(committed.ok()).toBe(true); entered(); await held;
    await route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Fixture lost autosave response" } } });
  }, { times: 1 });
  try {
    await answer.fill("A temporary change"); await reached; await answer.fill(original); release();
    await expect(page.getByRole("alert")).toContainText("lost autosave response"); await expect(answer).toHaveValue(original);
    await page.getByRole("button", { name: "Reload saved progress", exact: true }).click();
    await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible(); await expect(answer).toHaveValue(original);
    const saved = await onboarding.get({ accountId }); if (!saved.ok) throw new Error("Recovered answer unavailable"); expect(saved.value.answers.questionnaire.transformation).toBe(original);
    await page.reload(); await section(page, "questionnaire"); await expect(answer).toHaveValue(original);
  } finally { release(); await page.unroute("**/api/client/onboarding/save"); }
});
