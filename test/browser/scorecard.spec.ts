import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp } from "../support/app.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });

async function signIn(page: Page) {
  const email = `scorecard-${randomUUID()}@example.test`;
  const provisioned = await app.auth.provisionAccount({ email });
  expect(provisioned.ok).toBe(true);
  await app.auth.requestLink({ email, clientKey: "scorecard-browser" });
  const redeemed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) });
  if (!redeemed.ok) throw new Error("Fixture sign-in failed");
  await page.context().addCookies([{ name: "ebs-session", value: redeemed.value.sessionToken, url: app.origin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(app.origin);
  await expect(page.getByRole("heading", { name: "DAY 12", exact: true })).toBeVisible();
}

test("Harry’s shell fits phone and desktop, loads its own fonts under CSP, and exposes all progress cards", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (/Content Security Policy|Refused to/.test(message.text())) errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 36px "Bebas Neue"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('700 12px "Work Sans"'))).toBe(true);
  await expect(page.getByText("Sample day · resets on refresh")).toBeVisible();
  expect(await page.locator(".sc-app").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(10, 10, 10)");
  expect(await page.getByLabel("Body weight in kg").evaluate(element => getComputedStyle(element).fontSize)).toBe("56px");
  expect(await page.getByLabel("Calories eaten today").evaluate(element => getComputedStyle(element).fontSize)).toBe("26px");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("scorecard-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Show weight trend" }).click();
  await expect(page.getByRole("img", { name: /Sample weight trend/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("scorecard-trend.png"), fullPage: true });
  await page.getByRole("button", { name: "Show consistency" }).click();
  await expect(page.getByRole("table", { name: "Sample tracking over the last seven days" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("scorecard-consistency.png"), fullPage: true });
  await page.getByRole("button", { name: "Show body weight" }).click();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Profile", exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`scorecard-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("metrics complete at Harry’s targets, reject invalid edits, and reset honestly on refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  for (const [label, value, tile] of [
    ["Calories eaten today", "2000", "energy"], ["Protein in grams", "140", "protein"], ["Water in litres", "4", "water"],
    ["Hours slept", "8h30m", "sleep"], ["Steps today", "8,000", "steps"],
  ] as const) {
    const input = page.getByLabel(label);
    await input.fill(value);
    await input.press("Enter");
    await expect(page.getByTestId(`tile-${tile}`)).toHaveClass(/sc-tile-done/);
  }
  await page.getByLabel("Water in litres").fill("99");
  await page.getByLabel("Water in litres").press("Enter");
  await expect(page.getByRole("alert")).toContainText("between 0 and 20");
  await expect(page.getByLabel("Water in litres")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Water in litres").press("Escape");
  await expect(page.getByLabel("Water in litres")).toHaveValue("4");
  await page.getByLabel("Calories eaten today").fill("2500");
  await page.getByLabel("Calories eaten today").press("Tab");
  await expect(page.getByTestId("tile-energy")).not.toHaveClass(/sc-tile-done/);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByLabel("Calories eaten today")).toHaveValue("");
  await expect(page.getByLabel("Body weight in kg")).toHaveValue("77.5");
});

test("daily mindset and training interactions work, dialogs trap and restore focus, and user text stays text", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  for (const [label, value] of [["Calories eaten today", "2000"], ["Protein in grams", "150"], ["Water in litres", "4"],
    ["Hours slept", "8"], ["Steps today", "8000"]] as const) {
    await page.getByLabel(label).fill(value);
    await page.getByLabel(label).press("Enter");
  }
  const ltr = page.getByRole("button", { name: "Open L to R" });
  await ltr.click();
  await expect(page.getByRole("dialog", { name: "L to R" })).toBeVisible();
  await page.getByLabel("Left · Brain dump").fill("Make time for myself today");
  const goal = "Walk for 30 minutes";
  await page.getByLabel("Add a goal", { exact: true }).fill(goal);
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByRole("button", { name: `Prioritize ${goal}`, exact: true }).click();
  const unsafe = '<img src=x onerror="alert(1)">';
  await page.getByLabel("Add a goal", { exact: true }).fill(unsafe);
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await expect(page.getByText(unsafe, { exact: true })).toBeVisible();
  await expect(page.locator(".sc-goal img")).toHaveCount(0);
  await page.getByRole("button", { name: `Remove ${unsafe}`, exact: true }).click();
  await page.screenshot({ path: info.outputPath("scorecard-ltr.png"), fullPage: true });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(ltr).toBeFocused();
  await page.getByRole("button", { name: "Mark Focus complete" }).click();
  await expect(page.getByTestId("tile-focus")).toHaveClass(/sc-tile-done/);
  await page.getByRole("button", { name: "Read your Neural Map" }).click();
  await page.getByRole("button", { name: "Mark Map read for today" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tile-map")).toHaveClass(/sc-tile-done/);
  await page.getByRole("button", { name: "Read your Neural Map" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Training", exact: true }).click();
  await page.getByRole("button", { name: "Mark sample workout complete" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tile-training")).toHaveClass(/sc-tile-done/);
  await expect(page.getByRole("status")).toContainText("Day complete");
  await page.screenshot({ path: info.outputPath("scorecard-complete.png"), fullPage: true });
});

test("shell navigation labels later work as previews and leaves sign-out functional after a failed attempt", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Day 1 setup", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("onboarding iteration");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Log meal", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("meal logging iteration");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.route("**/api/auth/sign-out", route => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code: "unavailable" } }) }), { times: 1 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("sign-out");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${app.origin}/sign-in`);
  await page.goto(app.origin);
  await expect(page).toHaveURL(`${app.origin}/sign-in`);
});
