/** Manual screenshot sweep. Run only against scripts/with-postgres.sh's disposable DB. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { completedProfile } from "./support/client.ts";
import { createDatabase } from "../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../src/features/profile/index.ts";
import type { ClientProfile } from "../src/features/profile/index.ts";
import { SETUP_STEPS } from "../src/features/profile/onboarding-content.ts";
import { createScorecards, emptyScorecard } from "../src/features/scorecard/index.ts";
import { createLearning, emptyMap, EPISODES } from "../src/features/learning/index.ts";
import { createContentMedia } from "../src/features/content/index.ts";
import { createTraining } from "../src/features/training/index.ts";
import { createMeals, emptyMeal } from "../src/features/meals/index.ts";

function value<T>(result: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error)); return result.value;
}
const target = new URL(testDatabaseUrl());
const isolationMessage = "Visual fixtures require the disposable database from scripts/with-postgres.sh";
assert.ok(target.hostname === "127.0.0.1" && target.pathname === "/postgres" && target.port, isolationMessage);
const ports = execFileSync("docker", ["ps", "--filter", "label=elite-body-system.test=true", "--format", "{{.Ports}}"], { encoding: "utf8", timeout: 5000 });
assert.ok(ports.includes(`127.0.0.1:${target.port}->5432/tcp`), isolationMessage);
execFileSync(process.execPath, ["scripts/migrate.ts"], { stdio: "inherit", timeout: 60000 });
execFileSync(process.execPath, ["scripts/build.ts"], { stdio: "inherit", timeout: 60000 });
const label = process.argv[2] ?? "current"; assert.match(label, /^[a-z0-9-]+$/);
const output = resolve(".data", "visual-audit", label);
await mkdir(output, { recursive: true });
const videoFile = resolve(output, "fixture.webm");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x6a6c4b:s=640x360:r=10", "-t", "1", "-c:v", "libvpx-vp9", "-threads", "1", "-y", videoFile], { timeout: 20000 });
const app = await startTestApp({ harryPreview: true }), db = createDatabase(testDatabaseUrl()), browser = await chromium.launch();
const dateAgo = (days: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };
const today = dateAgo(0), startDate = dateAgo(84);
const profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => new Date(`${startDate}T12:00:00Z`) });
const scorecards = createScorecards(db), learning = createLearning({ db, profiles, media: createContentMedia(db) });
const training = createTraining({ db, profiles });
const meals = createMeals({ db, profiles, analyzer: { available: false, analyze: async () => ({ ok: false, error: { code: "not_configured", message: "Manual fixture" } }) } });
const notes = "I’m building a routine that fits around work and family. Four planned sessions, a walk at lunch, and enough energy to be present at home.";
const profile = completedProfile({ name: "Alex Morgan", startDate, equipment: "Local gym: barbells, dumbbells, cable machine and cardio equipment.", workaround: "Keep shoulder work controlled; choose a pain-free range.", identity: "keeps promises and trains with consistency", story: { ...completedProfile().story, role: "Business owner", age: "35–44", business: "A design studio", travel: "Monthly", want: notes, give: "Confidence, energy and more time with my family.", matters: "Being capable and present for the people I care about.", tried: "Personal trainer, Gym on my own", stopped: "Travel interrupted my routine.", now: "Ready to make time for this.", why: "A clear system I can follow.", source: "A friend" } });
async function fixture(name: string, data?: ClientProfile) {
  const email = `visual-${name}-${randomUUID()}@example.test`, account = value(await app.auth.provisionAccount({ email }));
  if (data) value(await profiles.save({ accountId: account.id, revision: 0, profile: data }));
  value(await app.auth.requestLink({ email, clientKey: randomUUID() }));
  const session = value(await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }));
  return { id: account.id, email, session: session.sessionToken };
}
const rows: unknown[] = [], errors: string[] = [];
try {
  const mature = await fixture("mature", profile), fresh = await fixture("fresh"), setup = await fixture("setup", { ...profile, completed: false });
  for (let day = 6; day >= 0; day--) value(await scorecards.save({ accountId: mature.id, date: dateAgo(day), revision: 0,
    scorecard: { ...emptyScorecard(), values: { weight: Number((78.2 - (6 - day) * .1).toFixed(1)), energy: 1850 + day * 25, protein: 142 + day, water: 3.5, sleep: 7.5, steps: 8500 },
      brainDump: notes, goals: [{ id: 1, text: "Protect 30 minutes for my most important work, then put my phone away and take a walk.", priority: true }, { id: 2, text: "Plan tomorrow’s meals before dinner.", priority: false }], checks: { training: false, map: false, focus: true } } }));
  let progress = value(await learning.get({ accountId: mature.id }));
  for (const episode of [...EPISODES].sort((a, b) => a.week - b.week)) progress = value(await learning.saveEpisode({ accountId: mature.id, id: episode.id, revision: progress.progressRevision, answers: episode.tasks.map(() => notes), complete: true }));
  const map = { ...emptyMap(), identity: "I keep my promises and train four days a week.", build: notes, refuse: "Always putting my health last and feeling too tired for family time.", signals: "I wake rested, lift with confidence and look forward to training.", leads: "A standard I bring to work, home and every decision.", final: "When I want to skip, I start anyway.", step: 6 };
  value(await learning.saveMap({ accountId: mature.id, revision: 0, map, finish: true }));
  const baseMeal = emptyMeal();
  value(await meals.log({ accountId: mature.id, date: today, requestId: randomUUID(), favorite: true, meal: { ...baseMeal, name: "Chicken, rice and roasted vegetables", note: "Home-cooked lunch, olive oil included.", items: [{ ...baseMeal.items[0]!, name: "Chicken and rice bowl", grams: 100, per100: { ...baseMeal.items[0]!.per100, energy: 520, protein: 42, carbs: 56, fat: 14 } }] } }));
  const monday = new Date(`${today}T12:00:00Z`); while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() - 1); monday.setUTCDate(monday.getUTCDate() - 7);
  const workoutDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10); });
  const previous = new Date(monday); previous.setUTCDate(previous.getUTCDate() - 7);
  const previousDate = previous.toISOString().slice(0, 10), history = value(await training.get({ accountId: mature.id, date: previousDate }));
  value(await training.save({ accountId: mature.id, revision: 0, workout: { ...history.workout, sets: { wpullup: [{ kg: 12, reps: 5, done: true }] }, notes: { wpullup: "Controlled reps with a full range." } }, finish: true }));
  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }, { name: "compact-desktop", width: 1024, height: 768, edge: true }, { name: "small-mobile", width: 320, height: 568, edge: true }, { name: "tablet", width: 768, height: 1024, edge: true }, { name: "landscape", width: 844, height: 390, edge: true }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce", hasTouch: viewport.width < 1024 });
    const page = await context.newPage();
    page.on("dialog", async dialog => { if (dialog.type() === "beforeunload") await dialog.accept(); });
    page.on("pageerror", error => errors.push(`${viewport.name}: ${error.message}`));
    const directory = resolve(output, viewport.name); await mkdir(directory, { recursive: true });
    async function capture(name: string) {
      await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); document.querySelector(".sc-workspace-body")?.scrollTo(0, 0); await new Promise(requestAnimationFrame); });
      const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
        height: document.documentElement.scrollHeight,
        smallTargets: [...document.querySelectorAll<HTMLElement>("button,a,input,select,summary")].filter(element => {
          const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && !element.closest("[inert]") && !element.matches(":disabled") && !["checkbox", "radio", "file"].includes(element.getAttribute("type") ?? "") && box.height < 40;
        }).map(element => ({ text: (element.getAttribute("aria-label") ?? element.textContent ?? element.tagName).trim().slice(0, 70), height: Math.round(element.getBoundingClientRect().height) })) }));
      const dialog = page.getByRole("dialog");
      const file = `${name}.png`; await page.screenshot({ path: resolve(directory, file), fullPage: !await dialog.isVisible(), animations: "disabled" });
      const setupFields = page.locator(".sc-dialog-setup .sc-setup-content");
      const scrollArea = await setupFields.isVisible() && await setupFields.evaluate(element => element.scrollHeight > element.clientHeight + 20) ? setupFields : dialog;
      if (await dialog.isVisible() && await scrollArea.evaluate(element => element.scrollHeight > element.clientHeight + 20)) {
        await scrollArea.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: resolve(directory, `${name}-end.png`), animations: "disabled" });
        await scrollArea.evaluate(element => { element.scrollTop = 0; });
      }
      const content = page.locator(".sc-workspace-body");
      if (!await dialog.isVisible() && await content.count() && await content.evaluate(element => element.scrollHeight > element.clientHeight + 20)) {
        await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: resolve(directory, `${name}-end.png`), animations: "disabled" });
        await content.evaluate(element => { element.scrollTop = 0; });
      }
      rows.push({ viewport: viewport.name, name, file: `${viewport.name}/${file}`, ...metrics });
      console.log(`${viewport.name}/${name}${metrics.overflow ? " OVERFLOW" : ""}`);
    }
    async function enter(account: typeof mature, path: string) {
      await context.clearCookies(); await context.addCookies([{ name: "ebs-session", value: account.session, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
      await page.goto(app.origin + path); await expect(page.locator(".sc-shell")).toBeVisible();
      await expect(page.getByText(/^Loading your (scorecard|workout|learning progress|meals)…$/)).toHaveCount(0);
    }
    if ("edge" in viewport) {
      for (const [name, path] of [["scorecard", "/"], ["training", `/training?date=${workoutDates[0]}`], ["map", "/mindset/map"], ["course-mindset", "/courses/mindset"], ["course-nutrition", "/courses/nutrition"], ["course-activity", "/courses/activity"], ["meals", "/meals"]]) { await enter(mature, path!); await capture(name!); }
      await page.getByRole("button", { name: "Enter nutrition manually" }).click(); await capture("meal-review");
      await enter(mature, "/?panel=profile"); await expect(page.getByRole("dialog")).toBeVisible(); await capture("dialog-profile");
      for (const step of [25, 28]) { const current = value(await profiles.get({ accountId: setup.id })); value(await profiles.save({ accountId: setup.id, revision: current.revision, profile: { ...profile, completed: false, setupStep: step } })); await enter(setup, "/"); await expect(page.getByRole("dialog")).toBeVisible(); await capture(`setup-${SETUP_STEPS[step]}`); }
      await context.clearCookies(); await page.goto(app.origin + "/sign-in"); await expect(page.getByLabel("Email address")).toBeVisible(); await capture("auth-sign-in");
      await context.close(); continue;
    }
    const blankDay = value(await scorecards.get({ accountId: fresh.id, date: today }));
    value(await scorecards.save({ accountId: fresh.id, date: today, revision: blankDay.revision, scorecard: emptyScorecard() }));
    await page.goto(app.origin + "/sign-in"); await expect(page.getByLabel("Email address")).toBeVisible(); await capture("auth-sign-in");
    await page.getByLabel("Email address").fill("harrybaldwin"); await capture("auth-preview");
    await page.getByLabel("Email address").fill(`unknown-${randomUUID()}@example.test`); await page.getByRole("button", { name: "Email me a sign-in link" }).click(); await expect(page.getByRole("status")).toBeVisible(); await capture("auth-link-sent");
    await page.goto(app.origin + "/sign-in/confirm#invalid");
    await expect(page.getByRole("alert")).toBeVisible(); await capture("auth-expired-link");
    const confirmEmail = `visual-confirm-${randomUUID()}@example.test`;
    value(await app.auth.provisionAccount({ email: confirmEmail }));
    value(await app.auth.requestLink({ email: confirmEmail, clientKey: randomUUID() }));
    await page.goto(await app.readLink(confirmEmail)); await expect(page.getByRole("button", { name: "Continue to Elite Body System" })).toBeVisible(); await capture("auth-confirm");
    await enter(fresh, "/"); await page.keyboard.press("Escape"); await capture("scorecard-empty");
    await page.getByLabel("Water in litres").fill("99"); await page.getByLabel("Water in litres").press("Enter"); await capture("scorecard-invalid"); await page.getByLabel("Water in litres").press("Escape");
    await page.route("**/api/client/day", route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Your changes could not be saved. Try again." } } }), { times: 1 });
    await page.getByLabel("Steps today").fill("5000"); await page.getByLabel("Steps today").press("Enter"); await expect(page.getByTestId("save-status")).toHaveText("Changes not saved"); await capture("scorecard-save-failed");
    await page.getByRole("button", { name: "Retry save", exact: true }).click(); await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
    for (const [path, endpoint] of [["/training", "training"], ["/mindset/map", "learning"], ["/meals", "meals"]]) {
      await page.route(`**/api/client/${endpoint}`, route => route.fulfill({ status: 503, json: { ok: false, error: { code: "unavailable", message: "Could not load your data. Try again." } } }), { times: 1 });
      await enter(fresh, path!); await expect(page.getByRole("alert")).toBeVisible(); await capture(`${endpoint}-load-failed`);
    }
    await enter(mature, "/"); await capture("scorecard-filled");
    if (viewport.name === "mobile") for (const card of ["weight trend", "consistency"]) { await page.getByRole("button", { name: `Show ${card}` }).click(); await capture(`scorecard-${card.replaceAll(" ", "-")}`); }
    await page.getByRole("button", { name: "Open L to R" }).click(); await capture("dialog-ltr"); await page.keyboard.press("Escape");
    await enter(mature, "/?panel=profile"); await expect(page.getByRole("dialog")).toBeVisible(); await capture("dialog-profile");
    for (let step = 0; step < SETUP_STEPS.length; step++) {
      const current = value(await profiles.get({ accountId: setup.id }));
      value(await profiles.save({ accountId: setup.id, revision: current.revision, profile: { ...profile, completed: false, setupStep: step, health: step === 26 ? { answers: [true, false, false, false, false, false, false], details: "A previous shoulder injury; clearance pending.", clearance: false } : profile.health } }));
      await enter(setup, "/"); await expect(page.getByRole("dialog")).toBeVisible(); await capture(`setup-${String(step + 1).padStart(2, "0")}-${SETUP_STEPS[step]}`);
      if (step === 2) { await page.getByLabel("What should Harry call you?").focus(); await capture("setup-name-focus"); }
    }
    for (let index = 0; index < workoutDates.length; index++) {
      await enter(mature, `/training?date=${workoutDates[index]}`); await capture(`training-day-${index + 1}-log`);
      if (await page.getByRole("button", { name: "Instructions", exact: true }).isVisible()) {
        await page.getByRole("button", { name: "Instructions", exact: true }).click(); await capture(`training-day-${index + 1}-instructions`);
        await page.getByRole("button", { name: "History", exact: true }).click(); await capture(`training-day-${index + 1}-history`);
      }
    }
    await enter(fresh, "/training"); await capture("training-setup-hold");
    const setupRow = value(await profiles.get({ accountId: setup.id }));
    value(await profiles.save({ accountId: setup.id, revision: setupRow.revision, profile: { ...profile, health: { answers: [true, false, false, false, false, false, false], details: "Clearance pending.", clearance: false } } }));
    await enter(setup, "/training"); await capture("training-clearance-hold");
    await enter(mature, `/training?date=${workoutDates[0]}`);
    await page.getByRole("button", { name: "Complete set 1 for Weighted Pull-up", exact: true }).click(); await expect(page.getByLabel("Rest remaining")).toBeVisible(); await capture("training-rest-timer");
    for (const pillar of ["mindset", "nutrition", "activity"]) {
      await enter(fresh, `/courses/${pillar}`); await capture(`course-${pillar}-locked`);
      await enter(mature, `/courses/${pillar}`); await capture(`course-${pillar}-list`);
      for (const episode of EPISODES.filter(item => item.pillar === pillar)) {
        await page.getByRole("button", { name: new RegExp(`Week ${episode.week} ·`) }).click(); await capture(`course-${episode.id}`); await page.getByRole("button", { name: "‹ Course", exact: true }).click();
      }
    }
    await enter(mature, "/mindset/map"); await capture("map-reading");
    for (let step = 0; step < 7; step++) {
      const current = value(await learning.get({ accountId: setup.id })); value(await learning.saveMap({ accountId: setup.id, revision: current.mapRevision, map: { ...map, final: "", step } }));
      await enter(setup, "/mindset/map"); await capture(`map-build-${step + 1}`);
    }
    await enter(fresh, "/meals"); await capture("meals-empty");
    await enter(mature, "/meals"); await capture("meals-filled");
    await page.getByRole("button", { name: "Enter nutrition manually" }).click(); await capture("meal-review-empty");
    await page.getByLabel("Meal name", { exact: true }).fill("Chicken, rice and roasted vegetables with a lemon dressing");
    await page.getByLabel("Ingredient 1 name").fill("Roasted chicken with extra virgin olive oil");
    await page.getByLabel("Calories per 100g for ingredient 1").fill("165"); await page.getByLabel("Calories per 100g for ingredient 1").press("Tab");
    await page.getByLabel("Protein per 100g for ingredient 1").fill("31"); await page.getByLabel("Protein per 100g for ingredient 1").press("Tab");
    await page.getByRole("button", { name: "+ Add ingredient" }).click(); await page.getByLabel("Ingredient 2 name").fill("Cooked rice and vegetables");
    await page.getByText("Fibre and micronutrients", { exact: true }).first().click(); await capture("meal-review-filled");
    await page.getByRole("button", { name: "Cancel review", exact: true }).click();
    await page.route("**/api/client/meals", async route => { const response = await route.fetch(); const body = await response.json(); body.value.analysisAvailable = true; await route.fulfill({ response, json: body }); }, { times: 1 });
    await enter(mature, "/meals"); await page.getByLabel("What did you eat?").fill("Chicken, rice and vegetables, with a teaspoon of olive oil.");
    const photo = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480; const paint = canvas.getContext("2d")!; paint.fillStyle = "#e2d7c0"; paint.fillRect(0, 0, 640, 480); paint.fillStyle = "#f3f0ea"; paint.beginPath(); paint.arc(320, 240, 180, 0, Math.PI * 2); paint.fill(); paint.fillStyle = "#6a6c4b"; paint.beginPath(); paint.arc(280, 220, 90, 0, Math.PI * 2); paint.fill(); return canvas.toDataURL("image/png").split(",")[1]!; });
    await page.getByLabel("Meal photos", { exact: true }).setInputFiles({ name: "meal.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
    await expect(page.getByAltText("Meal photo 1")).toBeVisible(); await capture("meals-photo");
    await page.route("**/api/client/meals/analyze", route => route.fulfill({ json: { ok: true, value: { ...baseMeal, name: "Chicken and rice bowl", note: "Estimated portion. Check the cooking oil and any dressing.", items: [{ ...baseMeal.items[0]!, name: "Chicken, rice and vegetables", grams: 350, source: "ai_estimate", per100: { ...baseMeal.items[0]!.per100, energy: 145, protein: 12, carbs: 18, fat: 3 } }] } } }), { times: 1 });
    await page.getByRole("button", { name: "Analyse meal", exact: true }).click(); await expect(page.getByRole("heading", { name: "Make it yours.", exact: true })).toBeVisible(); await capture("meal-review-ai");
    await page.getByRole("button", { name: "Cancel review", exact: true }).click();
    const media = createContentMedia(db), url = "https://media.example.test/visual-fixture.webm";
    await page.route(url, route => route.fulfill({ path: videoFile, contentType: "video/webm" }));
    value(await media.setVideo({ key: "exercise:wpullup", url })); value(await media.setVideo({ key: "course:m1", url }));
    await enter(mature, `/training?date=${workoutDates[0]}`); await page.getByRole("button", { name: "Instructions", exact: true }).click();
    await expect.poll(() => page.locator("video").evaluate(video => (video as HTMLVideoElement).videoWidth)).toBe(640); await capture("training-video");
    await enter(mature, "/courses/mindset"); await page.getByRole("button", { name: /Week 1 · The Neural Map/ }).click();
    await expect.poll(() => page.locator("video").evaluate(video => (video as HTMLVideoElement).videoWidth)).toBe(640); await capture("course-video");
    value(await media.setVideo({ key: "exercise:wpullup", url: null })); value(await media.setVideo({ key: "course:m1", url: null }));
    await context.close();
  }
  await writeFile(resolve(output, "manifest.json"), JSON.stringify({ label, screens: rows, errors }, null, 2));
  console.log(`Captured ${rows.length} screens. Browser errors: ${errors.length}. Output: ${output}`);
  if (errors.length) throw new Error(errors.join("\n"));
} finally { await browser.close(); await app.close(); await db.destroy(); }
