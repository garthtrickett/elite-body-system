import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp } from "../support/app.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });
async function signIn(page: Page) {
  const email = `setup-${randomUUID()}@example.test`;
  expect((await app.auth.provisionAccount({ email })).ok).toBe(true);
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const redeemed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!redeemed.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: redeemed.value.sessionToken, httpOnly: true, sameSite: "Lax", url: app.origin }]);
  await page.goto(app.origin);
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function next(page: Page, label = "Save and continue") {
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/api/client/profile") && response.request().method() === "POST" && response.status() === 200),
    page.getByRole("button", { name: label, exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toHaveCount(0);
}

test("setup resumes from PostgreSQL, completes Harry’s questions and persists targets and the first daily win", async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await next(page); await next(page);
  await page.getByLabel("What should Harry call you?").fill("Alex");
  await next(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "How old are you?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "35–44", exact: true }).click(); await next(page);
  await page.getByRole("button", { name: "Founder", exact: true }).click(); await next(page);
  await page.getByLabel("What’s the business, in a line?").fill("A small design studio"); await next(page);
  await page.getByRole("button", { name: "Monthly", exact: true }).click(); await next(page);
  await next(page); await next(page); await next(page); // How, rhythm, coaching conversation
  await expect(page.getByRole("heading", { name: "Pick your four training days.", exact: true })).toBeVisible();
  await next(page);
  await page.getByLabel("Where will you train, and what equipment do you have?").fill("Gym with dumbbells and a rack"); await next(page);
  await page.getByLabel("When will you fill in your scorecard?").fill("After breakfast");
  await page.getByLabel("Your time zone (for example Europe/London)").fill("Europe/London"); await next(page);
  await next(page); // Story introduction
  for (const answer of ["Become stronger", "More energy", "Be present for my family", "Putting myself last"]) {
    await page.locator("dialog textarea").fill(answer); await next(page);
  }
  await page.getByRole("button", { name: "Gym on my own", exact: true }).click(); await next(page);
  for (const answer of ["Work got in the way", "Ready for change", "Personal coaching", "Time"]) {
    await page.locator("dialog textarea").fill(answer); await next(page);
  }
  await page.getByRole("button", { name: "Instagram", exact: true }).click(); await next(page);
  await next(page); // Safety introduction
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("answer each health question");
  const questions = page.locator("fieldset.sc-panel-card");
  await expect(questions).toHaveCount(7);
  for (let i = 0; i < 7; i++) await questions.nth(i).getByRole("button", { name: i === 0 ? "Yes" : "No", exact: true }).click();
  await next(page);
  await page.getByLabel("Tell Harry about the condition, medication or injury").fill("Discussed a condition with my doctor"); await next(page);
  await page.getByLabel("Emergency contact’s name").fill("Jordan");
  await page.getByLabel("Emergency contact’s phone (include country code)").fill("+441234567890"); await next(page);
  await expect(page.getByText(/Draft wording — awaiting the approved consent document/)).toBeVisible();
  await page.getByLabel("I have read and acknowledge this draft").check();
  await page.getByLabel("I agree to storing my health answers for coaching").check();
  await page.getByLabel("I am at least 18 years old").check();
  await page.getByLabel("Full name", { exact: true }).fill("Alex Client"); await next(page);
  await page.getByLabel("Starting body weight in kg").fill("80"); await next(page);
  await page.getByLabel("I’m becoming someone who…").fill("keeps promises to myself"); await next(page);
  await page.getByLabel("Empty your head", { exact: true }).fill("I can make time today");
  await page.getByLabel("One priority for 30 minutes of focus").fill("Go for a walk"); await next(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Commit to my plan", exact: true })).toBeVisible();
  await next(page, "Commit to my plan");
  await page.getByRole("button", { name: "See my scorecard", exact: true }).click();
  await expect(page.getByLabel("Body weight in kg")).toHaveValue("80");
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await page.reload();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("Body weight in kg")).toHaveValue("80");
  await expect(page.getByRole("button", { name: "Open L to R" })).toContainText("1 goal");
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Training on hold: clearance needed");
  await page.getByLabel("Energy (kcal)", { exact: true }).fill("2400");
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save targets", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Calories eaten today")).toHaveAttribute("placeholder", "Add");
  await expect(page.getByTestId("tile-energy")).toContainText("of 2400 kcal");
  await page.getByLabel("Calories eaten today").fill("2400"); await page.getByLabel("Calories eaten today").press("Enter");
  await expect(page.getByTestId("tile-energy")).toHaveClass(/sc-tile-done/);
  await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
  await page.screenshot({ path: info.outputPath("saved-client-scorecard.png"), fullPage: true });
});

test("another tab sees the saved account and stale profile revisions surface a conflict", async ({ page }) => {
  await signIn(page);
  await next(page); await next(page);
  await page.getByLabel("What should Harry call you?").fill("First tab"); await next(page);
  await page.keyboard.press("Escape");
  const other = await page.context().newPage(); await other.goto(app.origin);
  await expect(other.getByRole("dialog")).toBeVisible(); await other.keyboard.press("Escape");
  for (const tab of [page, other]) await tab.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByLabel("Energy (kcal)", { exact: true }).fill("2300");
  await page.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save targets", exact: true })).toBeEnabled();
  await other.getByLabel("Energy (kcal)", { exact: true }).fill("2600");
  await other.getByRole("button", { name: "Save targets", exact: true }).click();
  await expect(other.getByRole("dialog").getByRole("alert")).toContainText("changed in another tab");
  await expect(other.getByLabel("Energy (kcal)", { exact: true })).toHaveValue("2600");
  await other.close();
});
