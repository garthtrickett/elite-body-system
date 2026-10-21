import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { completedProfile } from "../support/client.ts";
import { createDatabase } from "../../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../../src/features/profile/index.ts";
import type { ClientProfile } from "../../src/features/profile/index.ts";
import { createLearning, EPISODES } from "../../src/features/learning/index.ts";
import { createContentMedia } from "../../src/features/content/index.ts";
import { createMeals, emptyMeal } from "../../src/features/meals/index.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const unavailable = { ok: false, error: { code: "unavailable", message: "Could not reach your account. Try again." } };
function monday(offset = 0) {
  const date = new Date(); while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10);
}
async function signIn(page: Page, options: Readonly<{ profile?: Partial<ClientProfile>; allLessons?: boolean; meals?: number }> = {}) {
  const email = `audit13-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Fixture provisioning failed");
  const db = createDatabase(testDatabaseUrl());
  const start = new Date(); start.setUTCDate(start.getUTCDate() - 90);
  const profile = completedProfile({ startDate: start.toISOString().slice(0, 10), ...options.profile });
  const profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => start });
  try {
    expect((await profiles.save({ accountId: account.value.id, revision: 0, profile })).ok).toBe(true);
    if (options.allLessons) {
      const learning = createLearning({ db, profiles, media: createContentMedia(db) });
      let snapshot = await learning.get({ accountId: account.value.id });
      for (const episode of [...EPISODES].sort((a, b) => a.week - b.week)) {
        if (!snapshot.ok) throw new Error("Fixture learning unavailable");
        snapshot = await learning.saveEpisode({ accountId: account.value.id, id: episode.id, revision: snapshot.value.progressRevision,
          answers: episode.tasks.map(() => "I keep my promises and protect time for my health. ".repeat(6)), complete: true });
      }
      expect(snapshot.ok).toBe(true);
    }
    const meals = createMeals({ db, profiles, analyzer: { available: false, analyze: async () => ({ ok: false, error: { code: "not_configured", message: "Manual fixture" } }) } });
    for (let index = 0; index < (options.meals ?? 0); index++) expect((await meals.log({ accountId: account.value.id, date: new Date().toISOString().slice(0, 10),
      requestId: randomUUID(), favorite: false, meal: { ...emptyMeal(), name: `Previous meal ${index + 1}`, items: emptyMeal().items.map(item => ({ ...item, per100: { ...item.per100, energy: 100 } })) } })).ok).toBe(true);
  } finally { await db.destroy(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!session.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
}
async function insideTask(page: Page, control: Locator) {
  await expect(control).toBeInViewport();
  const field = (await control.boundingBox())!, area = (await page.locator(".sc-workspace-body").boundingBox())!;
  expect(field.y).toBeGreaterThanOrEqual(area.y - 1);
  expect(field.y + field.height).toBeLessThanOrEqual(area.y + area.height + 1);
}

test("workout date switching hides stale controls, restores the loaded date on failure and retries the requested day", async ({ page }, info) => {
  await signIn(page);
  for (const size of [sizes[1]!, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size); await page.goto(`${app.origin}/training?date=${monday()}`);
    const date = page.getByLabel("Workout date"), next = monday(1);
    await expect(date).toHaveValue(monday());
    let release: () => void = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/client/training?date=${next}`, async route => { await gate; await route.fulfill({ status: 503, json: unavailable }); }, { times: 1 });
    await date.fill(next); await date.dispatchEvent("change");
    await expect(page.getByText("Loading your workout…", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Your notes for Weighted Pull-up")).toHaveCount(0);
    await expect(page.getByTestId("training-save-status")).toHaveCount(0);
    release(); await expect(page.getByRole("alert")).toBeVisible();
    await expect(date).toHaveValue(monday());
    await expect(page.getByTestId("training-save-status")).toContainText("Previous workout shown");
    await page.screenshot({ path: info.outputPath(`date-failure-${size.width}.png`) });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(date).toHaveValue(next);
    await expect(page.getByRole("heading", { name: "Compound Day", exact: true })).toHaveCount(0);
    await expect(page.getByText("Loading your workout…", { exact: true })).toHaveCount(0);
  }
});

test("landscape setup reveals the next step below its sticky header", async ({ page }, info) => {
  await signIn(page, { profile: { completed: false, setupStep: 25 } });
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto(app.origin);
  await expect(page.getByRole("heading", { name: "Health check", exact: true })).toBeVisible();
  const next = page.getByRole("button", { name: "Save and continue", exact: true });
  await next.click();
  const name = page.getByLabel("Emergency contact’s name", { exact: true });
  await expect(name).toBeEnabled(); await expect(name).toBeInViewport();
  const field = (await name.boundingBox())!, header = (await page.locator(".sc-panel-header").boundingBox())!;
  expect(field.y).toBeGreaterThanOrEqual(header.y + header.height);
  await expect(page.locator(".sc-setup-progress")).toBeFocused();
  await page.screenshot({ path: info.outputPath("setup-transition.png") });
});

test("lower completed lessons open from their beginning and course completion copy describes review", async ({ page }, info) => {
  await signIn(page, { allLessons: true });
  for (const size of [...sizes, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size); await page.goto(`${app.origin}/courses/mindset`);
    const welcome = page.locator(size.width >= 1024 ? ".sc-course-welcome" : ".sc-course-next");
    await expect(welcome).toContainText("Review your completed lessons and saved answers");
    await expect(welcome).not.toContainText("saved as you go");
    await page.getByRole("button", { name: /Week 10 · Reading the Signals/ }).click();
    await expect(page.locator(".sc-lesson")).toBeFocused();
    await insideTask(page, page.getByRole("button", { name: "‹ Course", exact: true }));
    await expect(page.getByRole("heading", { name: "Reading the Signals", exact: true })).toBeInViewport();
    await expect(page.locator(".sc-lesson textarea")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`lesson-open-${size.width}.png`) });
  }
});

test("Map steps reveal their title once without resetting scroll on subsequent edits", async ({ page }, info) => {
  await signIn(page);
  for (const size of sizes) {
    await page.setViewportSize(size); await page.goto(`${app.origin}/mindset/map`);
    // The first pass persists step 2; subsequent passes return to step 1 using Back.
    await expect(page.locator(".sc-map-context h1")).toBeVisible();
    while (!(await page.locator(".sc-map-context h1").innerText()).includes("Your three networks")) {
      const title = await page.locator(".sc-map-context h1").innerText();
      await page.getByRole("button", { name: title === "Build your Neural Map" ? "Save and continue" : "Back", exact: true }).click();
      await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
    }
    await page.getByRole("button", { name: "Save and continue", exact: true }).click();
    const heading = page.getByRole("heading", { name: "Who I am", exact: true });
    await expect(heading).toBeFocused(); await insideTask(page, heading);
    await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
    const answer = page.getByLabel(/^Who I am/); await answer.focus(); await answer.evaluate(element => element.scrollIntoView({ block: "center" }));
    await answer.fill("I train consistently.");
    const offset = await page.locator(".sc-workspace-body").evaluate(element => element.scrollTop);
    await answer.fill("I train consistently, every week.");
    expect(await page.locator(".sc-workspace-body").evaluate(element => element.scrollTop)).toBe(offset);
    await expect(answer).toBeFocused(); await insideTask(page, answer);
    await page.screenshot({ path: info.outputPath(`map-step-${size.width}.png`) });
    await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  }
});

test("target errors name the invalid field and range, focus it, and recover", async ({ page }, info) => {
  await signIn(page);
  for (const size of sizes.slice(0, 2)) {
    await page.setViewportSize(size); await page.goto(`${app.origin}/?panel=profile`);
    const energy = page.getByLabel("Energy (kcal)", { exact: true }); await energy.fill("0");
    await page.getByRole("button", { name: "Save targets", exact: true }).click();
    await expect(energy).toBeFocused(); await expect(energy).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#target-error-energy")).toContainText("500 and 10,000");
    await insideTaskDialog(page, energy);
    await page.screenshot({ path: info.outputPath(`target-error-${size.width}.png`) });
    await energy.fill("2400"); await page.getByRole("button", { name: "Save targets", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save targets", exact: true })).toBeEnabled();
    await expect(energy).toHaveAttribute("aria-invalid", "false");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tile-energy")).toContainText("2400 kcal");
  }
});
async function insideTaskDialog(page: Page, control: Locator) {
  const field = (await control.boundingBox())!, header = (await page.locator(".sc-panel-header").boundingBox())!, dialog = (await page.getByRole("dialog").boundingBox())!;
  expect(field.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(field.y + field.height).toBeLessThan(dialog.y + dialog.height);
}

test("set errors stay beside the focused field and running rest is visible beside the sets; future swaps are disabled", async ({ page }, info) => {
  for (const size of sizes) {
    await signIn(page); await page.setViewportSize(size); await page.goto(`${app.origin}/training?date=${monday()}`);
    const reps = page.getByLabel("Weighted Pull-up set 1 reps", { exact: true });
    await reps.fill("1001"); await reps.press("Enter");
    await expect(reps).toHaveAttribute("aria-invalid", "true"); await expect(reps).toBeFocused(); await insideTask(page, reps);
    await expect(page.locator("#set-error-wpullup-0-reps")).toContainText("whole-number reps");
    await expect(page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`set-invalid-${size.width}.png`) });
    await reps.fill("5"); await reps.press("Enter");
    await page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true }).click();
    await expect(page.getByTestId("training-save-status")).toHaveText("Workout saved to your account");
    await expect(page.getByLabel("Rest remaining")).toContainText("Rest running");
    await expect(page.getByRole("button", { name: /^Start rest/ })).toHaveCount(0);
    await expect(page.getByLabel("Rest remaining")).toBeInViewport();
    const timer = (await page.getByLabel("Rest remaining").boundingBox())!, task = (await page.locator(".sc-workspace-body").boundingBox())!, nav = (await page.getByRole("navigation", { name: "Main navigation" }).boundingBox())!;
    expect(timer.y).toBeGreaterThanOrEqual(task.y + task.height);
    expect(timer.y + timer.height).toBeLessThanOrEqual(nav.y);
    await page.screenshot({ path: info.outputPath(`rest-running-${size.width}.png`) });
    await page.goto(`${app.origin}/training?date=${monday(7)}`);
    await expect(page.getByRole("button", { name: "Swap to Lat Pulldown", exact: true })).toBeDisabled();
  }
});

test("failed day saves keep retry feedback visible, the field in view, and persist on retry", async ({ page }, info) => {
  await signIn(page);
  for (const size of [...sizes, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size); await page.goto(app.origin);
    await page.route("**/api/client/day", route => route.fulfill({ status: 503, json: unavailable }), { times: 1 });
    const steps = page.getByLabel("Steps today", { exact: true }); await steps.fill(String(8999 + size.width)); await steps.press("Enter");
    const feedback = page.locator(size.width >= 1024 ? ".sc-sync-desktop" : ".sc-sync-footer");
    await expect(feedback.getByRole("alert")).toBeInViewport();
    await expect(feedback.getByRole("button", { name: "Retry save", exact: true })).toBeInViewport();
    await expect(steps).toBeFocused(); await insideTask(page, steps);
    await expect(page.getByTestId("tile-steps")).toContainText("Day changes not saved");
    await page.screenshot({ path: info.outputPath(`day-save-failed-${size.width}.png`) });
    await feedback.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
    await page.reload(); await expect(steps).toHaveValue(String(8999 + size.width));
  }
});

test("new ingredients receive focus and desktop review totals stay visible with a populated history", async ({ page }, info) => {
  await signIn(page, { meals: 5 });
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, sizes[1]!]) {
    await page.setViewportSize(size); await page.goto(`${app.origin}/meals`);
    await page.getByRole("button", { name: "Enter nutrition manually", exact: true }).click();
    await page.getByLabel("Calories per 100g for ingredient 1").fill("165");
    for (const index of [2, 3]) {
      await page.getByRole("button", { name: "+ Add ingredient", exact: true }).click();
      const name = page.getByLabel(`Ingredient ${index} name`, { exact: true });
      await expect(name).toBeFocused(); await insideTask(page, name);
      await name.press("Tab"); await expect(page.getByLabel(`Portion for ingredient ${index}`, { exact: true })).toBeFocused();
    }
    await page.getByLabel("Fat per 100g for ingredient 3").scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /^Log meal for / })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Log meal for / })).toBeInViewport();
    if (size.width >= 1024) await expect(page.getByLabel("Meal totals", { exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`busy-review-${size.width}.png`) });
    await page.getByRole("button", { name: "Cancel review", exact: true }).click();
  }
});

test("incomplete lessons focus and identify missing answers with feedback beside completion", async ({ page }, info) => {
  await signIn(page);
  for (const size of sizes) {
    await page.setViewportSize(size); await page.goto(`${app.origin}/courses/mindset`);
    await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
    await page.getByRole("button", { name: "Mark lesson complete", exact: true }).click();
    const answers = page.locator(".sc-lesson textarea");
    await expect(answers.first()).toBeFocused(); await insideTask(page, answers.first());
    await expect(answers.first()).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#answer-error-0")).toContainText("Answer this task");
    await page.screenshot({ path: info.outputPath(`lesson-invalid-${size.width}.png`) });
    for (const answer of await answers.all()) await answer.fill("After breakfast, every day.");
    await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
    // Leave it incomplete so each viewport exercises missing-answer validation.
    for (const answer of await answers.all()) await answer.fill("");
    await expect(page.getByTestId("learning-save-status")).toHaveText("Progress saved to your account");
  }
});
