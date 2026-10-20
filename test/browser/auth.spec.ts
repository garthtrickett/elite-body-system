import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startTestApp } from "../support/app.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
test.beforeAll(async () => { app = await startTestApp(); });
test.afterAll(async () => { await app.close(); });

test("desktop and mobile sign-in are styled, labeled, keyboard accessible and fit the viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${app.origin}/sign-in`);
  await expect(page.getByRole("heading", { name: "Sign in to your account." })).toBeVisible();
  const input = page.getByLabel("Email address");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("autocomplete", "email");
  expect(await input.evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe("12px");
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeFocused();
  await page.screenshot({ path: info.outputPath("sign-in-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(input).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("sign-in-mobile.png"), fullPage: true });
});

test("email link signs in only after confirmation, removes its fragment, and sign-out revokes the session", async ({ page }) => {
  const email = `browser-${randomUUID()}@example.test`;
  expect((await app.auth.provisionAccount({ email })).ok).toBe(true);
  await page.goto(`${app.origin}/sign-in`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("If this email can sign in");
  const link = await app.readLink(email);
  const leaks: string[] = [];
  page.on("request", request => { if (request.url().includes(new URL(link).hash.slice(1))) leaks.push(request.url()); });
  await page.goto(link);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(leaks).toEqual([]);
  expect((await page.context().cookies()).some(cookie => cookie.name === "ebs-session")).toBe(false);
  await page.getByRole("button", { name: "Continue to Elite Body System" }).click();
  await expect(page.getByRole("heading", { name: "DAY 1", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const session = (await page.context().cookies()).find(cookie => cookie.name === "ebs-session");
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${app.origin}/sign-in`);
  await page.goto(app.origin);
  await expect(page).toHaveURL(`${app.origin}/sign-in`);
  await page.goto(link);
  await expect(page.getByRole("alert")).toContainText("expired or has already been used");
});

test("invalid links explain recovery and unknown addresses get the generic acknowledgement", async ({ page }) => {
  await page.goto(`${app.origin}/sign-in/confirm#invalid`);
  await expect(page.getByRole("alert")).toContainText("Request a new one");
  await page.getByRole("link", { name: "Request a new link" }).click();
  await page.getByLabel("Email address").fill(`unknown-${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("If this email can sign in");
});

test("SAM retains the inspected account after a transient redemption failure and accepts an explicit retry", async ({ page }) => {
  const email = `retry-${randomUUID()}@example.test`;
  expect((await app.auth.provisionAccount({ email })).ok).toBe(true);
  expect((await app.auth.requestLink({ email, clientKey: "browser-retry-test" })).ok).toBe(true);
  await page.goto(await app.readLink(email));
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.route("**/api/auth/redeem-link", route => route.fulfill({ status: 503,
    contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "unavailable" } }) }), { times: 1 });
  await page.getByRole("button", { name: "Continue to Elite Body System" }).click();
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Elite Body System" }).click();
  await expect(page.getByRole("heading", { name: "DAY 1", exact: true })).toBeVisible();
});
