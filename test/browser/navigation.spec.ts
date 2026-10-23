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
async function signIn(page: Page, modern = false) {
  const email = `navigation-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture account unavailable");
  const db = createDatabase(testDatabaseUrl());
  try {
    const store = createPostgresProfileStore(db);
    if (modern) expect(await store.write({ accountId: account.value.id, revision: 0, profile: completedProfile({ onboardingVersion: "harry-v2" }) })).toBeTruthy();
    else expect((await createProfiles({ store }).save({ accountId: account.value.id, revision: 0, profile: completedProfile() })).ok).toBe(true);
  }
  finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!session.ok) throw new Error("Fixture session unavailable");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Workspace navigation" });
function monday(offset = 0) { const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
async function stableNodes(page: Page) {
  const doc = await page.evaluateHandle(() => document), sidebar = await page.locator(".sc-sidebar").elementHandle(), mobile = await page.locator(".sc-mobile-nav").elementHandle();
  return async () => expect(await page.evaluate(({ doc, sidebar, mobile }) => doc === document && sidebar === document.querySelector(".sc-sidebar") && mobile === document.querySelector(".sc-mobile-nav"), { doc, sidebar, mobile })).toBe(true);
}

test("desktop navigation preserves the document, sidebar identity and scroll across every section and history traversal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 }); await signIn(page); await page.goto(app.origin);
  await expect(page.getByLabel("Calories eaten today")).toBeVisible(); const identity = await stableNodes(page);
  await page.locator(".sc-sidebar").evaluate(element => { element.scrollTop = 50; });
  const scroll = await page.locator(".sc-sidebar").evaluate(element => element.scrollTop); expect(scroll).toBeGreaterThan(0);
  for (const [name, path] of [["Training", "/training"], ["Meals", "/meals"], ["Neural Map", "/mindset/map"], ["Mindset", "/courses/mindset"], ["Nutrition", "/courses/nutrition"], ["Activity", "/courses/activity"], ["Scorecard", "/"]] as const) {
    const link = nav(page).getByRole("link", { name, exact: true });
    if (name === "Training") await link.dispatchEvent("click"); else await link.click();
    await expect(page).toHaveURL(app.origin + path);
    if (name === "Training") expect(await page.locator(".sc-sidebar").evaluate(element => element.scrollTop)).toBe(scroll);
    await expect(nav(page).getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(new RegExp(name)); await identity();
    // Clicking an offscreen link may scroll it into view; route rendering keeps that position.
    const position = await page.locator(".sc-sidebar").evaluate(element => element.scrollTop);
    await page.getByRole("status").filter({ hasText: "Opening page" }).waitFor({ state: "hidden" });
    expect(await page.locator(".sc-sidebar").evaluate(element => element.scrollTop)).toBe(position);
  }
  await page.goBack(); await expect(page).toHaveURL(app.origin + "/courses/activity"); await identity();
  await page.goForward(); await expect(page).toHaveURL(app.origin + "/"); await identity();
  const length = await page.evaluate(() => history.length); await nav(page).getByRole("link", { name: "Scorecard", exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test("query intents retain scorecard drafts, reopen same-route panels, and work through direct links and refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin);
  await expect(page.getByLabel("Calories eaten today")).toBeVisible(); const identity = await stableNodes(page);
  await nav(page).getByRole("link", { name: "Profile", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/?panel=profile");
  await expect(nav(page).getByRole("link", { name: "Profile", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByRole("link", { name: "Scorecard", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.getByLabel("Energy (kcal)", { exact: true }).fill("2417"); await page.keyboard.press("Escape");
  await nav(page).getByRole("link", { name: "Scorecard", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/");
  await nav(page).getByRole("link", { name: "Profile", exact: true }).click(); await expect(page.getByLabel("Energy (kcal)", { exact: true })).toHaveValue("2417");
  await page.keyboard.press("Escape"); await nav(page).getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await identity();
  await page.getByRole("button", { name: "Save targets", exact: true }).click(); await expect(page.getByRole("button", { name: "Save targets", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape"); await nav(page).getByRole("link", { name: "Day 1 setup", exact: true }).click();
  await expect(page).toHaveURL(app.origin + "/?panel=setup"); await expect(page.getByRole("dialog")).toContainText("Step 1 of 34"); await identity();
  await page.keyboard.press("Escape"); await page.reload(); await expect(page.getByRole("dialog")).toContainText("Step 1 of 34");
  await page.keyboard.press("Escape"); await page.goto(app.origin + "/?panel=profile"); await expect(page.getByLabel("Energy (kcal)", { exact: true })).toHaveValue("2417");
});

test("training date links and picker preserve query intent through refresh and Back/Forward", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + `/training?date=${monday(-7)}`);
  await expect(page.getByLabel("Workout date")).toHaveValue(monday(-7)); const identity = await stableNodes(page);
  await page.getByLabel("Workout date").fill(monday(-14)); await page.getByLabel("Workout date").dispatchEvent("change");
  await expect(page).toHaveURL(app.origin + `/training?date=${monday(-14)}`);
  await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/meals");
  await page.goBack(); await expect(page.getByLabel("Workout date")).toHaveValue(monday(-14)); await identity();
  await page.goForward(); await expect(page).toHaveURL(app.origin + "/meals"); await identity();
  await page.goBack(); await expect(page.getByLabel("Workout date")).toHaveValue(monday(-14)); await page.reload(); await expect(page.getByLabel("Workout date")).toHaveValue(monday(-14));
});

test("invalid uncommitted training text survives cancelled link and Back navigation with URL consistency", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/meals");
  await nav(page).getByRole("link", { name: "Training", exact: true }).evaluate((element, date) => element.setAttribute("href", `/training?date=${date}`), monday(-7));
  await nav(page).getByRole("link", { name: "Training", exact: true }).click(); const url = app.origin + `/training?date=${monday(-7)}`;
  const reps = page.getByLabel("Weighted Pull-up set 1 reps"); await reps.fill("oops");
  let warnings = 0; page.on("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); warnings++; await dialog.dismiss(); });
  await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect.poll(() => warnings).toBe(1); await expect(page).toHaveURL(url); await expect(reps).toHaveValue("oops");
  await page.evaluate(() => history.back()); await expect.poll(() => warnings).toBe(2); await expect(page).toHaveURL(url); await expect(reps).toHaveValue("oops");
  page.removeAllListeners("dialog"); page.once("dialog", dialog => dialog.accept()); await page.evaluate(() => history.back());
  await expect(page).toHaveURL(app.origin + "/meals"); await expect(page.getByLabel("What did you eat?")).toBeVisible();
});

test("mobile More dismisses, content scroll resets, modified links keep href behavior, and shell survives setup", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, true); await page.goto(app.origin);
  await expect(page.getByLabel("Calories eaten today")).toBeVisible(); const identity = await stableNodes(page);
  await page.getByRole("button", { name: "More navigation" }).click(); await page.locator("#workspace-more-menu").getByRole("link", { name: "Meals", exact: true }).click();
  await expect(page).toHaveURL(app.origin + "/meals"); await expect(page.locator("#workspace-more-menu")).toBeHidden(); await identity();
  await page.locator("#workspace-content").evaluate(element => { element.scrollTop = 100; });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Training", exact: true }).click();
  await expect(page).toHaveURL(app.origin + "/training"); await identity();
  expect(await page.locator("#workspace-content").evaluate(element => element.scrollTop)).toBe(0);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Day 1 setup", exact: true }).click();
  await expect(page).toHaveURL(app.origin + "/onboarding"); await expect(page.getByRole("heading", { name: "Welcome video", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Day 1 setup", exact: true })).toHaveAttribute("aria-current", "page"); await identity();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Scorecard", exact: true }).click();
  await expect(page).toHaveURL(app.origin + "/"); await identity();
  await page.setViewportSize({ width: 1440, height: 900 });
  const popupEvent = page.context().waitForEvent("page"); await nav(page).getByRole("link", { name: "Meals", exact: true }).click({ modifiers: ["Control"] });
  const popup = await popupEvent; await popup.waitForLoadState(); await expect(popup).toHaveURL(app.origin + "/meals"); await expect(page).toHaveURL(app.origin + "/"); await identity(); await popup.close();
});

test("pending workout writes block Back and leaving; retry preserves a newer edit after a failed save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/meals");
  await nav(page).getByRole("link", { name: "Training", exact: true }).evaluate((element, date) => element.setAttribute("href", `/training?date=${date}`), monday(-7));
  await nav(page).getByRole("link", { name: "Training", exact: true }).click();
  let release = () => {}, reached = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), writing = new Promise<void>(resolve => { reached = resolve; });
  let attempts = 0;
  await page.route("**/api/client/training", async route => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    attempts++; if (attempts === 1) { reached(); await held; await route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Fixture save failure" } } }); }
    else await route.continue();
  });
  try {
    await page.getByLabel("Your notes for Weighted Pull-up").fill("First edit"); await writing;
    await page.getByLabel("Your notes for Weighted Pull-up").fill("Newest edit");
    await page.evaluate(() => history.back());
    await expect(page.locator(".sc-route-status")).toContainText("finish saving"); await expect(page).toHaveURL(app.origin + `/training?date=${monday(-7)}`);
    release(); await expect(page.getByText("Fixture save failure", { exact: true })).toBeVisible();
    let warnings = 0; page.on("dialog", async dialog => { warnings++; await dialog.dismiss(); });
    await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect.poll(() => warnings).toBe(1);
    await expect(page.getByLabel("Your notes for Weighted Pull-up")).toHaveValue("Newest edit");
    await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
    await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/meals");
    await page.goBack(); await expect(page.getByLabel("Your notes for Weighted Pull-up")).toHaveValue("Newest edit");
  } finally { release(); }
});

test("failed learning saves preserve Map and lesson edits when route changes are cancelled", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/courses/mindset");
  await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
  await page.route("**/api/client/learning/episode", route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Fixture learning failure" } } }));
  const answer = page.getByLabel("When will you read your Map each day?"); await answer.fill("After breakfast");
  await expect(page.getByTestId("learning-save-status")).toHaveText("Changes not saved");
  let warnings = 0; page.on("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); warnings++; await dialog.dismiss(); });
  await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect.poll(() => warnings).toBe(1); await expect(answer).toHaveValue("After breakfast");
  await page.unroute("**/api/client/learning/episode"); await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  await nav(page).getByRole("link", { name: "Neural Map", exact: true }).click();
  for (let index = 0; index < 2; index++) { await page.getByRole("button", { name: "Save and continue", exact: true }).click(); await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account"); }
  await page.route("**/api/client/learning/map", route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Fixture Map failure" } } }));
  await page.getByLabel(/^Who I am/).fill("I keep promises"); await expect(page.getByTestId("learning-save-status")).toHaveText("Changes not saved");
  await page.evaluate(() => history.back()); await expect.poll(() => warnings).toBe(2); await expect(page).toHaveURL(app.origin + "/mindset/map"); await expect(page.getByLabel(/^Who I am/)).toHaveValue("I keep promises");
});

test("meal review cancellation retains numbers and uncertain log retries keep their exact idempotent payload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/meals");
  await page.getByRole("button", { name: "Enter nutrition manually", exact: true }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Navigation lunch"); await page.getByLabel("Calories per 100g for ingredient 1").fill("200"); await page.getByLabel("Calories per 100g for ingredient 1").press("Tab");
  let warnings = 0; page.on("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); warnings++; await dialog.dismiss(); });
  await nav(page).getByRole("link", { name: "Training", exact: true }).click(); await expect.poll(() => warnings).toBe(1); await expect(page).toHaveURL(app.origin + "/meals"); await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue("Navigation lunch");
  const payloads: string[] = [];
  await page.route("**/api/client/meals/log", async route => { payloads.push(route.request().postData()!); if (payloads.length === 1) { const result = await route.fetch(); expect(result.ok()).toBe(true); await route.abort(); } else await route.continue(); });
  await page.getByRole("button", { name: /^Log meal for / }).click(); await expect(page.getByRole("button", { name: "Retry same action", exact: true })).toBeVisible();
  await nav(page).getByRole("link", { name: "Training", exact: true }).dispatchEvent("click"); await expect(page.locator(".sc-route-status")).toContainText("Retry safely"); await expect(page).toHaveURL(app.origin + "/meals"); expect(warnings).toBe(1);
  await page.getByRole("button", { name: "Retry same action", exact: true }).click(); await expect(page.getByRole("button", { name: "Remove Navigation lunch from this day", exact: true })).toHaveCount(1); expect(payloads).toHaveLength(2); expect(payloads[0]).toBe(payloads[1]);
  await nav(page).getByRole("link", { name: "Scorecard", exact: true }).click(); await expect(page.getByLabel("Calories eaten today")).toHaveValue("200");
});

test("route loading errors allow retry, edits made during resolution are guarded, and abandoned loads cannot render", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/meals"); await expect(page.getByLabel("What did you eat?")).toBeVisible();
  let release = () => {}, reached = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), resolving = new Promise<void>(resolve => { reached = resolve; });
  let requests = 0;
  await page.route("**/training", async route => { if (route.request().headers().accept !== "application/json") { await route.continue(); return; } requests++; if (requests === 1) { reached(); await held; await route.abort(); } else await route.continue(); });
  try {
    await nav(page).getByRole("link", { name: "Training", exact: true }).click(); await resolving;
    await page.getByLabel("What did you eat?").fill("A draft written during navigation"); release();
    await expect(page.getByRole("button", { name: "Retry navigation", exact: true })).toBeVisible(); await expect(page).toHaveURL(app.origin + "/meals");
    let warnings = 0; page.on("dialog", async dialog => { warnings++; await dialog.dismiss(); });
    await page.getByRole("button", { name: "Retry navigation", exact: true }).click(); await expect.poll(() => warnings).toBe(1); await expect(page.getByLabel("What did you eat?")).toHaveValue("A draft written during navigation");
    await page.getByLabel("What did you eat?").fill("");
    let releaseLoad = () => {}, loaded = () => {}; const loadHeld = new Promise<void>(resolve => { releaseLoad = resolve; }), loadStarted = new Promise<void>(resolve => { loaded = resolve; });
    await page.route("**/api/client/training", async route => { loaded(); await loadHeld; try { await route.continue(); } catch { /* disposed request */ } });
    try {
      await nav(page).getByRole("link", { name: "Training", exact: true }).click(); await loadStarted;
      await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect(page.getByLabel("What did you eat?")).toBeVisible(); releaseLoad();
      await expect(page).toHaveURL(app.origin + "/meals"); await expect(page.getByLabel("Workout date")).toHaveCount(0);
    } finally { releaseLoad(); }
  } finally { release(); }
});

test("route listeners and intervals return to baseline after repeated mounts", async ({ page }) => {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const records = new Map<EventTarget, Map<string, Set<EventListenerOrEventListenerObject>>>();
    const relevant = new Set(["click", "popstate", "beforeunload", "resize", "visibilitychange", "hashchange"]);
    Object.defineProperty(EventTarget.prototype, "addEventListener", { value: function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) {
      if ((this === window || this === document) && relevant.has(type) && new Error().stack?.includes("/assets/app.js")) { const target = records.get(this) ?? new Map<string, Set<EventListenerOrEventListenerObject>>(); const listeners = target.get(type) ?? new Set<EventListenerOrEventListenerObject>(); listeners.add(listener); target.set(type, listeners); records.set(this, target); }
      Reflect.apply(add, this, [type, listener, options]);
    } });
    Object.defineProperty(EventTarget.prototype, "removeEventListener", { value: function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) {
      records.get(this)?.get(type)?.delete(listener); Reflect.apply(remove, this, [type, listener, options]);
    } });
    const interval = window.setInterval, clear = window.clearInterval, intervals = new Set<unknown>();
    Object.defineProperty(window, "setInterval", { value: (...args: Parameters<typeof window.setInterval>) => { const id = Reflect.apply(interval, window, args); intervals.add(id); return id; } });
    Object.defineProperty(window, "clearInterval", { value: (id: number) => { intervals.delete(id); Reflect.apply(clear, window, [id]); } });
    Object.assign(window, { navigationResources: () => ({ intervals: intervals.size, listeners: [...records.values()].reduce((total, target) => total + [...target.values()].reduce((sum, entries) => sum + entries.size, 0), 0) }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin); await expect(page.getByLabel("Calories eaten today")).toBeVisible();
  const resources = () => page.evaluate(() => (window as typeof window & { navigationResources: () => { intervals: number; listeners: number } }).navigationResources());
  const baseline = await resources(); expect(baseline.intervals).toBe(1); const identity = await stableNodes(page);
  for (let round = 0; round < 3; round++) {
    for (const name of ["Training", "Meals", "Mindset", "Scorecard"]) {
      await nav(page).getByRole("link", { name, exact: true }).click(); await expect(nav(page).getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await expect(page.getByLabel("Calories eaten today")).toBeVisible(); expect(await resources()).toEqual(baseline); await identity();
  }
});

test("mandatory onboarding and expired sessions remain authoritative during client routing", async ({ page }) => {
  const gated = await startTestApp({ onboardingEnabled: true });
  try {
    const email = `gate-navigation-${randomUUID()}@example.test`, account = await gated.auth.provisionAccount({ email }); if (!account.ok) throw new Error("Fixture provisioning failed");
    await gated.auth.requestLink({ email, clientKey: randomUUID() });
    const session = await gated.auth.redeemLink({ token: new URL(await gated.readLink(email)).hash.slice(1) }); if (!session.ok) throw new Error("Fixture session failed");
    await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, url: gated.origin, httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(gated.origin); await expect(page).toHaveURL(gated.origin + "/onboarding");
    await expect(page.getByRole("heading", { name: "Welcome video", exact: true })).toBeVisible(); const identity = await stableNodes(page); const length = await page.evaluate(() => history.length);
    const response = await page.request.get(gated.origin + "/training", { headers: { Accept: "application/json" } }); expect(response.url()).toBe(gated.origin + "/onboarding"); expect((await response.json()).value.page).toBe("onboarding");
    await nav(page).getByRole("link", { name: "Training", exact: true }).click(); await expect(page.locator(".sc-route-status")).toBeHidden(); await expect(page).toHaveURL(gated.origin + "/onboarding"); await identity(); expect(await page.evaluate(() => history.length)).toBe(length);
    expect((await page.request.get(gated.origin + "/api/client/training")).status()).toBe(403);
    await page.context().clearCookies(); await nav(page).getByRole("link", { name: "Meals", exact: true }).click(); await expect(page).toHaveURL(gated.origin + "/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  } finally { await gated.close(); }
});

test("legacy setup drafts survive cancelled route changes and real reloads still use unload protection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/?panel=setup");
  for (let index = 0; index < 2; index++) { await page.getByRole("button", { name: "Save and continue", exact: true }).click(); await expect(page.getByRole("button", { name: "Saving…", exact: true })).toHaveCount(0); }
  const name = page.getByLabel("What should Harry call you?"); await name.fill("Unsaved setup name"); await page.keyboard.press("Escape");
  let confirmations = 0, unloads = 0;
  page.on("dialog", async dialog => { if (dialog.type() === "beforeunload") unloads++; else { expect(dialog.type()).toBe("confirm"); confirmations++; } await dialog.dismiss(); });
  await nav(page).getByRole("link", { name: "Training", exact: true }).click(); await expect.poll(() => confirmations).toBe(1); await expect(page).toHaveURL(app.origin + "/?panel=setup");
  await nav(page).getByRole("link", { name: "Day 1 setup", exact: true }).click(); await expect(name).toHaveValue("Unsaved setup name");
  await page.evaluate(() => location.reload()); await expect.poll(() => unloads).toBe(1); await expect(name).toHaveValue("Unsaved setup name");
});

test("background questionnaire saves block sidebar and Back navigation while preserving newer typing", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await signIn(page, true); await page.goto(app.origin + "/meals");
    await page.locator('a[href="/?panel=setup"]').filter({ visible: true }).click(); await expect(page).toHaveURL(app.origin + "/onboarding");
    const chooseQuestionnaire = async () => {
      const mobile = page.locator(".ob-nav-mobile"); if (await mobile.isVisible()) await mobile.locator("summary").click();
      await page.getByRole("navigation", { name: "Onboarding sections" }).getByRole("button", { name: /Your questionnaire/ }).click();
      await expect(page.getByRole("heading", { name: "Your questionnaire", exact: true })).toBeVisible();
    };
    await chooseQuestionnaire();
    let release = () => {}, reached = () => {};
    const held = new Promise<void>(resolve => { release = resolve; }), saving = new Promise<void>(resolve => { reached = resolve; });
    await page.route("**/api/client/onboarding/save", async route => { const response = await route.fetch(); reached(); await held; await route.fulfill({ response }); }, { times: 1 });
    try {
      const answer = page.getByLabel("What would be an incredible result for you over the next 180 days? What do you want to achieve?", { exact: true });
      await answer.fill("First answer"); await saving; await expect(answer).toBeEnabled(); await answer.fill(`Newest answer at ${width}`);
      const meals = width === 1440 ? nav(page).getByRole("link", { name: "Meals", exact: true }) : page.locator("#workspace-more-menu").getByRole("link", { name: "Meals", exact: true });
      if (width !== 1440) await page.getByRole("button", { name: "More navigation", exact: true }).click();
      await meals.dispatchEvent("click"); await expect(page.locator(".sc-route-status")).toContainText("finish before leaving"); await expect(page).toHaveURL(app.origin + "/onboarding");
      const backResolved = page.waitForResponse(response => new URL(response.url()).pathname === "/" && response.request().headers().accept === "application/json");
      await page.evaluate(() => history.back()); await backResolved; await expect(page.locator(".sc-route-status")).toContainText("finish before leaving"); await expect(page).toHaveURL(app.origin + "/onboarding"); await expect(answer).toHaveValue(`Newest answer at ${width}`);
      release(); await expect(page.getByTestId("onboarding-save-status")).toHaveText("Progress saved to your account");
      await meals.click(); await expect(page).toHaveURL(app.origin + "/meals");
      await page.goBack(); await expect(page).toHaveURL(app.origin + "/onboarding"); await chooseQuestionnaire(); await expect(answer).toHaveValue(`Newest answer at ${width}`);
    } finally { release(); await page.unroute("**/api/client/onboarding/save"); }
  }
});

test("accepted Back discard disposes the old route before inert focus changes can commit raw input", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await signIn(page); await page.goto(app.origin + "/meals");
  await nav(page).getByRole("link", { name: "Training", exact: true }).evaluate((element, date) => element.setAttribute("href", `/training?date=${date}`), monday(-7));
  await nav(page).getByRole("link", { name: "Training", exact: true }).click();
  await page.getByLabel("Weighted Pull-up set 1 weight").fill("17");
  let writes = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/client/training") writes++; });
  page.on("dialog", async dialog => { expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
  await page.evaluate(() => {
    const go = history.go.bind(history);
    // A busy browser can delay the accepted traversal past a focus update/frame.
    history.go = (delta = 0) => { if (delta < 0) window.setTimeout(() => go(delta), 500); else go(delta); };
    history.back();
  });
  await expect(page.getByLabel("What did you eat?")).toBeVisible(); await expect(page).toHaveURL(app.origin + "/meals");
  expect(writes).toBe(0);
  await page.goForward(); await expect(page.getByLabel("Weighted Pull-up set 1 weight")).toHaveValue("");
});
