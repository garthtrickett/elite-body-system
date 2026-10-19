import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  workers: 1,
  retries: 0,
  use: { browserName: "chromium", headless: true, trace: "retain-on-failure" },
  reporter: "list",
});
