import { test, expect } from "@playwright/test";
import type { Page, BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/platform/database/connection.ts";
import type { AccountsId } from "../../src/platform/database/generated/public/Accounts.ts";
import type { SalesCallSlotsId } from "../../src/platform/database/generated/public/SalesCallSlots.ts";
import { createSalesManagement } from "../../src/features/sales/index.ts";
import { createPostgresProfileStore } from "../../src/features/profile/index.ts";
import { completedProfile } from "../support/client.ts";
import { startTestApp, testDatabaseUrl } from "../support/app.ts";
const db = createDatabase(testDatabaseUrl()), ids: AccountsId[] = [], publicEmails: string[] = [], slots: SalesCallSlotsId[] = [];
const masterEmail = `portal-browser-master-${randomUUID()}@example.test`;
let app: Awaited<ReturnType<typeof startTestApp>>, manager: AccountsId;
test.beforeAll(async () => { app = await startTestApp({ masterEmail }); manager = await account(masterEmail); await db.insertInto("business_managers").values({ account_id: manager }).execute(); await db.insertInto("performance_mentors").values({ account_id: manager, all_clients: true }).execute(); });
test.afterAll(async () => { if (publicEmails.length) { const leads = await db.selectFrom("sales_leads").select("visitor_id").where("email", "in", publicEmails).execute(); if (leads.length) await db.deleteFrom("sales_visitors").where("id", "in", leads.map(l => l.visitor_id)).execute(); } if (slots.length) await db.deleteFrom("sales_call_slots").where("id", "in", slots).execute(); await db.deleteFrom("accounts").where("id", "in", ids).execute(); await app.close(); await db.destroy(); });
async function account(email = `portal-browser-member-${randomUUID()}@example.test`) { const a = await app.auth.provisionAccount({ email }); if (!a.ok) throw new Error("Test account unavailable"); const id = a.value.id as AccountsId; ids.push(id); return id; }
async function signIn(context: BrowserContext, id: AccountsId) { const a = await db.selectFrom("accounts").select("email").where("id", "=", id).executeTakeFirstOrThrow(); await app.auth.requestLink({ email: a.email, clientKey: randomUUID() }); const s = await app.auth.redeemLink({ token: new URL(await app.readLink(a.email)).hash.slice(1) }); if (!s.ok) throw new Error("Test session unavailable"); await context.addCookies([{ name: "ebs-session", value: s.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]); }
async function apply(page: Page, email: string) {
  await page.goto(app.origin + "/apply#apply"); await page.getByLabel("Full name", { exact: true }).fill("Portal browser applicant"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Age", { exact: true }).selectOption("35–44"); await page.getByLabel("Your role and business", { exact: true }).fill("Founder"); await page.getByLabel("Main goal", { exact: true }).selectOption("Build strength and muscle"); await page.getByLabel("Training now", { exact: true }).selectOption("2–3 times a week"); await page.getByLabel("What's stopped you getting the result so far?", { exact: true }).fill("A routine that works around travel."); await page.getByRole("radio", { name: "Yes, I'm ready to start", exact: true }).check(); await page.getByRole("button", { name: "Submit application", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/book-call");
}

test("Free Value opens thirty editable insights, then application and confirmed booking reach the story feed", async ({ page }, info) => {
  test.setTimeout(60000); const email = `portal-funnel-${randomUUID()}@example.test`; publicEmails.push(email);
  const management = createSalesManagement({ db }), initial = await management.snapshot({ actorId: manager }); if (!initial.ok) throw new Error("Settings unavailable");
  const start = Date.now() + 10 * 86400000, slot = await management.slot({ actorId: manager, startsAt: new Date(start).toISOString(), endsAt: new Date(start + 1800000).toISOString(), meetingUrl: "https://meet.example.test/call" }); if (!slot.ok) throw new Error("Call slot unavailable"); slots.push(slot.value.id as SalesCallSlotsId);
  const settings = { ...initial.value.settings, stories: [{ id: "portal-browser-story", name: "Approved test fixture", title: "Synthetic approved story", body: "Isolated test content; no real outcome claimed.", imageUrl: "", videoUrl: "", published: true, consentConfirmed: true }] }; expect((await management.settings({ actorId: manager, revision: initial.value.revision, settings })).ok).toBe(true);
  try {
    await page.goto(app.origin + "/free-value"); await page.getByLabel("Your name", { exact: true }).fill("Portal browser applicant"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Join 30 Days, 30 Insights", exact: true }).click(); await expect(page.getByRole("heading", { name: "Your insights are ready.", exact: true })).toBeVisible(); await expect(page.locator("#insights-guide details")).toHaveCount(30);
    await page.screenshot({ path: info.outputPath("free-value-guide.png"), fullPage: true });
    await apply(page, email); await expect(page.locator(".sf-faq-item")).toHaveCount(10); await expect(page.getByRole("heading", { name: "Meet Harry Baldwin.", exact: true })).toBeVisible();
    await page.locator(".sf-slot input").first().check(); await page.getByRole("button", { name: "Confirm your call", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/client-stories"); await expect(page.getByRole("heading", { name: "Synthetic approved story", exact: true })).toBeVisible(); await expect(page.getByText(/Call booked/)).toBeVisible();
    await page.getByRole("link", { name: "Booking details", exact: true }).click(); await expect(page.getByRole("link", { name: "Add to calendar", exact: false })).toHaveAttribute("href", "/api/sales/calendar");
  } finally { const current = await management.snapshot({ actorId: manager }); if (!current.ok) throw new Error("Settings unavailable"); expect((await management.settings({ actorId: manager, revision: current.value.revision, settings: initial.value.settings })).ok).toBe(true); }
});

test("master email confirmation opens all three portal areas and sign-out revokes access", async ({ page }) => {
  await page.goto(app.origin + "/master/sign-in"); await expect(page.getByLabel("Username", { exact: true })).toHaveValue("harrybaldwin"); await page.getByRole("button", { name: "Send secure sign-in link", exact: true }).click(); await expect(page.getByRole("status")).toContainText("If this email can sign in");
  await page.goto(await app.readLink(masterEmail)); await page.getByRole("button", { name: "Continue to Elite Body System", exact: true }).click(); await expect(page).toHaveURL(app.origin + "/manage");
  for (const label of ["Elite Marketing System", "Elite Sales System", "Elite Delivery"]) { await page.getByRole("link", { name: label, exact: true }).click(); await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible(); }
  await expect(page.getByRole("link", { name: "EBS Mentor Portal", exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "EBS Member Portal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.goto(app.origin + "/manage"); await expect(page).toHaveURL(app.origin + "/master/sign-in");
});

test("Marketing walks through proof, drafts and downloads while protecting unsaved work", async ({ page }, info) => {
  test.setTimeout(60000); await signIn(page.context(), manager); await page.goto(app.origin + "/manage/marketing"); await page.getByRole("button", { name: "Start an article", exact: false }).click();
  const title = `A repeatable week ${randomUUID()}`; await page.getByLabel("Article subject", { exact: true }).fill(title); await page.getByLabel("YouTube source", { exact: true }).fill("https://www.youtube.com/watch?v=abcdefghijk"); await page.getByLabel("Why does this matter to your client?", { exact: true }).fill("A practical routine for a founder’s real diary.");
  await page.getByRole("button", { name: "Refresh", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Save your workspace edits" })).toBeVisible(); await expect(page.getByLabel("Article subject", { exact: true })).toHaveValue(title);
  await page.getByRole("button", { name: "Start the interview", exact: false }).click();
  const answers = ["A changing diary.", "Owner’s supplied experience.", "Too much complexity.", "Choose a repeatable routine.", "", "Protect your next training appointment."];
  for (let i = 0; i < answers.length; i++) { await page.locator(".marketing-interview textarea").fill(answers[i]!); if (i < answers.length - 1) await page.getByRole("button", { name: "Next question", exact: false }).click(); }
  await page.getByRole("button", { name: "Build blog and script", exact: false }).click(); await expect(page.getByRole("alert").filter({ hasText: "including a real result" })).toBeVisible();
  await page.locator(".marketing-question-nav button").nth(4).click(); await page.locator(".marketing-interview textarea").fill("Owner’s supplied story, to be checked before use."); await page.locator(".marketing-question-nav button").nth(5).click(); await page.getByRole("button", { name: "Build blog and script", exact: false }).click();
  await expect(page.getByLabel("Blog · Markdown", { exact: true })).toHaveValue(/Owner’s supplied story/);
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download for Notion", exact: true }).click(); expect((await download).suggestedFilename()).toMatch(/\.md$/);
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("marketing-phone.png"), fullPage: true });
  await page.reload(); await page.getByRole("button", { name: new RegExp(title) }).click(); await expect(page.getByLabel("Article subject", { exact: true })).toHaveValue(title);
});

test("Mentor and Member messages survive a lost response without duplication and community works", async ({ page, browser }, info) => {
  test.setTimeout(60000); const member = await account(); await createPostgresProfileStore(db).write({ accountId: member, revision: 0, profile: completedProfile() }); await db.insertInto("coaching_memberships").values({ client_id: member, level: "individual", active: true }).execute(); await signIn(page.context(), manager);
  const record = await db.selectFrom("accounts").select("email").where("id", "=", member).executeTakeFirstOrThrow(); await page.goto(app.origin + "/mentor"); await page.locator(".dv-client").filter({ hasText: record.email }).click(); await page.getByRole("button", { name: "Messages", exact: true }).click(); await page.getByLabel("Your message", { exact: true }).fill("A clear coaching action.");
  await page.route("**/api/mentor/delivery/messages/send", async route => { await route.fetch(); await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Lost response" } }) }); }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click(); await expect(page.getByRole("button", { name: "Retry last action", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Retry last action", exact: true }).click(); await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("");
  const sent = await db.selectFrom("coaching_messages").select("id").where("client_id", "=", member).where("body", "=", "A clear coaching action.").execute(); expect(sent).toHaveLength(1);
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try { await signIn(memberContext, member); const memberPage = await memberContext.newPage(); await memberPage.goto(app.origin + "/messages"); await expect(memberPage.getByText("A clear coaching action.", { exact: true })).toBeVisible(); await memberPage.getByLabel("Your message", { exact: true }).fill("Member update."); await memberPage.getByRole("button", { name: "Send message", exact: true }).click(); await expect(memberPage.getByLabel("Your message", { exact: true })).toHaveValue(""); await memberPage.getByRole("button", { name: "Community", exact: true }).click(); await memberPage.getByLabel("Your post", { exact: true }).fill("A useful community win."); await memberPage.getByRole("button", { name: "Post to community", exact: true }).click(); await expect(memberPage.getByText("A useful community win.", { exact: true })).toBeVisible(); expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await memberPage.screenshot({ path: info.outputPath("member-community-phone.png"), fullPage: true }); }
  finally { await memberContext.close(); }
});
