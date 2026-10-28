import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/platform/database/connection.ts";
import type { AccountsId } from "../../src/platform/database/generated/public/Accounts.ts";
import { createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { createWeeklyCheckins } from "../../src/features/checkins/index.ts";
import { dateShift } from "../../src/features/checkins/data.ts";
import { entryWeek, storedJson } from "../../src/features/checkins/persistence.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
import { completedProfile } from "../support/client.ts";
import { checkinEntry, completeAnswers } from "../support/checkins.ts";
let app: Awaited<ReturnType<typeof startTestApp>>;
const db = createDatabase(testDatabaseUrl());
test.beforeAll(async () => { app = await startTestApp({ checkinsEnabled: true }); });
test.afterAll(async () => { await app.close(); await db.destroy(); });
async function signIn(page: Page, coach = false) {
  const email = `checkin-browser-${randomUUID()}@example.test`, account = await app.auth.provisionAccount({ email });
  if (!account.ok) throw new Error("Account unavailable"); const id = account.value.id as AccountsId;
  expect(await createPostgresProfileStore(db).write({ accountId: id, revision: 0, profile: completedProfile() })).toBeTruthy();
  await db.insertInto("weekly_checkin_schedules").values({ account_id: id, timezone: "UTC", first_week: "2020-01-04" }).execute();
  if (coach) { await db.insertInto("performance_mentors").values({ account_id: id }).execute(); await db.insertInto("mentor_clients").values({ mentor_id: id, client_id: id }).execute(); }
  await app.auth.requestLink({ email, clientKey: randomUUID() }); const session = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!session.ok) throw new Error("Session unavailable");
  await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  return id;
}
async function fill(page: Page) {
  await page.getByLabel("What went well this week? (Wins)").fill("I completed all training sessions.");
  for (const label of ["Training", "Nutrition", "Recovery", "Mindset", "Energy", "Judgement", "Focus", "Drive"]) await page.getByRole("radio", { name: `${label} 8 out of 10`, exact: true }).check();
  await page.getByRole("radio", { name: "Improved", exact: true }).check(); await page.getByRole("radio", { name: "More Control (Technique)", exact: true }).check();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("80"); await page.getByLabel("Waist (cm)", { exact: true }).fill("82"); await page.getByLabel("Priority muscle group (cm)", { exact: true }).fill("38");
  await page.getByRole("textbox", { name: "Think like an Athlete", exact: true }).fill("Preparing meals helped me stay consistent.");
}
test("the due check-in gates pages and APIs, autosaves partial answers and shows inline completion reminders", async ({ page }) => {
  const id = await signIn(page); await page.goto(app.origin); await expect(page).toHaveURL(app.origin + "/check-in");
  await expect(page.getByRole("heading", { name: "EBS Check In", exact: true })).toBeVisible();
  expect((await page.request.get(app.origin + "/api/client/state")).status()).toBe(403);
  expect((await page.request.get(app.origin + "/api/mentor/checkins")).status()).toBe(403);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0); await expect(page.getByRole("link", { name: /dashboard/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Complete", exact: true }).click(); await expect(page.getByText("Fill out this section then click complete to send it", { exact: true })).toHaveCount(5);
  await page.getByLabel("What went well this week? (Wins)").fill("An autosaved win");
  await expect.poll(async () => (await db.selectFrom("weekly_checkins").select("revision").where("account_id", "=", id).executeTakeFirst())?.revision ?? 0).toBeGreaterThan(0);
  await expect(page.getByText("Fill out this section then click complete to send it", { exact: true })).toHaveCount(4);
  await page.reload(); await expect(page.getByLabel("What went well this week? (Wins)")).toHaveValue("An autosaved win");
  const row = await db.selectFrom("weekly_checkins").select("submitted_at").where("account_id", "=", id).executeTakeFirstOrThrow(); expect(row.submitted_at).toBeNull();
});
test("Complete opens branded Progress, filling score bars, ordered graphs and optional past comparisons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); const id = await signIn(page);
  const current = await createWeeklyCheckins({ db, enabled: true, hour: 9 }).get({ accountId: id }); if (!current.ok) throw new Error("Snapshot unavailable");
  const prior = checkinEntry({ week: dateShift(current.value.week, -7), submittedAt: "2026-01-01T10:00:00Z" });
  await db.insertInto("weekly_checkins").values({ account_id: id, week: entryWeek(prior.week), revision: 1, data: storedJson({ ...prior.answers, version: "body-v1", question: prior.question }), submitted_at: new Date() }).execute();
  await page.goto(app.origin + "/check-in"); const titleFont = await page.getByText("Fundamentals", { exact: true }).first().evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
  await fill(page); await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);
  const scores = page.locator(".ci-score-item"); await expect(scores).toHaveCount(8); await expect(page.getByRole("meter")).toHaveCount(8);
  await page.getByRole("combobox", { name: "Compare this check-in to a past one" }).selectOption(prior.week); await expect(page.getByRole("meter")).toHaveCount(16);
  expect(await page.locator(".ci-chart").filter({ has: page.locator("figcaption", { hasText: "Muscle Gain" }) }).locator("figcaption").evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }))).toEqual(titleFont);
  expect(await page.evaluate(() => { const scores = document.querySelector(".ci-bars"), average = [...document.querySelectorAll("figcaption")].find(element => element.textContent === "Score averages"); return !!scores && !!average && !!(scores.compareDocumentPosition(average) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
  const pair = page.locator(".ci-charts > .ci-chart"); await expect(pair).toHaveCount(2); const boxes = await Promise.all([pair.nth(0).boundingBox(), pair.nth(1).boundingBox()]); expect(boxes[0]!.y).toBe(boxes[1]!.y); expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  await expect(page.locator(".ci-past")).toHaveCount(0); await page.getByRole("button", { name: "Continue", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/");
});
test("coach receives only assigned submissions, sees the first expanded and clears reviewed work without deleting history", async ({ page }) => {
  const id = await signIn(page, true), checkins = createWeeklyCheckins({ db, enabled: true, hour: 9 }); const snapshot = await checkins.get({ accountId: id }); if (!snapshot.ok) throw new Error("Snapshot unavailable");
  const saved = await checkins.save({ accountId: id, week: snapshot.value.week, revision: 0, answers: completeAnswers(snapshot.value.week), submit: true }); expect(saved.ok).toBe(true);
  await page.goto(app.origin + "/mentor/check-ins"); await expect(page.getByRole("heading", { name: "Performance Mentor", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Collapse.*check-in/ })).toHaveAttribute("aria-expanded", "true"); await expect(page.getByText(completeAnswers().wins, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "AI summary", exact: true }).click(); await expect(page.getByText("AI summaries are not connected yet. The full check-in is available.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "✓ Mark reviewed", exact: true }).click(); await expect(page.getByRole("heading", { name: "All caught up", exact: true })).toBeVisible();
  const history = await checkins.history({ accountId: id }); expect(history.ok && history.value.entries.length).toBe(1); const review = await db.selectFrom("weekly_checkin_reviews").select("reviewed_by").where("account_id", "=", id).executeTakeFirstOrThrow(); expect(review.reviewed_by).toBe(id);
});
test("phone check-in is compact, has consistent Data labels and no overflowing content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page); await page.goto(app.origin + "/check-in"); await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask a different question", exact: true })).toHaveCount(0);
  const labels = page.locator(".ci-data-label"); const fonts = await labels.evaluateAll(elements => elements.map(element => ({ family: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize, transform: getComputedStyle(element).textTransform }))); expect(fonts).toHaveLength(2); expect(fonts[0]).toEqual(fonts[1]); expect(fonts[0]!.transform).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("temporary Harry walkthrough opens Progress from an empty form without creating a fake submission", async ({ page }) => {
  const preview = await startTestApp({ harryPreview: true, previewFlow: true, checkinsEnabled: true });
  try {
    const account = await preview.auth.provisionAccount({ email: "harrybaldwin@preview.invalid" }); if (!account.ok) throw new Error("Account unavailable");
    const existing = await db.selectFrom("client_profiles").select("revision").where("account_id", "=", account.value.id as AccountsId).executeTakeFirst();
    expect(await createPostgresProfileStore(db).write({ accountId: account.value.id, revision: existing?.revision ?? 0, profile: completedProfile() })).toBeTruthy();
    const session = await preview.auth.signInHarryPreview({ alias: "harrybaldwin", clientKey: randomUUID() }); if (!session.ok) throw new Error("Session unavailable");
    await page.context().addCookies([{ name: "ebs-session", value: session.value.sessionToken, httpOnly: true, sameSite: "Lax", url: preview.origin }]); await page.goto(preview.origin + "/check-in");
    await page.getByRole("button", { name: "Complete", exact: true }).click(); await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
    await expect(page.getByRole("meter")).toHaveCount(0); await page.getByRole("button", { name: "Back to check-in", exact: true }).click(); await expect(page.getByRole("button", { name: "Complete", exact: true })).toBeVisible();
    const rows = await db.selectFrom("weekly_checkins").select("submitted_at").where("account_id", "=", account.value.id as AccountsId).execute(); expect(rows.every(row => row.submitted_at === null)).toBe(true);
  } finally { await preview.close(); }
});
