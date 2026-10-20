import { test, expect } from "@playwright/test";
import { readdir } from "node:fs/promises";
import { startTestApp } from "../support/app.ts";
import { HARRY_PREVIEW_EMAIL } from "../../src/features/auth/index.ts";

test("Harry enters the alias in the email field and signs into his own persistent preview account without an email", async ({ page }) => {
  const app = await startTestApp({ harryPreview: true });
  try {
    expect((await app.auth.provisionAccount({ email: HARRY_PREVIEW_EMAIL })).ok).toBe(true);
    await page.goto(`${app.origin}/sign-in`);
    const input = page.getByLabel("Email address"); await input.fill("harrybaldwin");
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(app.origin + "/");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByLabel("Water in litres").fill("2"); await page.getByLabel("Water in litres").press("Enter");
    await expect(page.getByTestId("save-status")).toHaveText("Saved to your account");
    await page.reload(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByLabel("Water in litres")).toHaveValue("2");
    expect((await readdir(app.outbox)).length).toBe(0);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(page.getByText(HARRY_PREVIEW_EMAIL, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(`${app.origin}/sign-in`);
  } finally {
    // Close browser connections before stopping this test-owned HTTP server.
    // Otherwise a pending browser request can keep server.close() awaiting teardown.
    await page.close(); await app.close();
  }
});

test("disabled preview access cannot navigate into the app", async ({ page }) => {
  const app = await startTestApp();
  try {
    await app.auth.provisionAccount({ email: HARRY_PREVIEW_EMAIL });
    await page.goto(`${app.origin}/sign-in`); await page.getByLabel("Email address").fill("harrybaldwin");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Preview sign-in is unavailable");
    await expect(page).toHaveURL(`${app.origin}/sign-in`);
    expect((await page.context().cookies()).some(cookie => cookie.name === "ebs-session")).toBe(false);
  } finally {
    // Close browser connections before stopping this test-owned HTTP server.
    // Otherwise a pending browser request can keep server.close() awaiting teardown.
    await page.close(); await app.close();
  }
});
