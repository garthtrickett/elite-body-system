import { readFile, writeFile, open, rm } from "node:fs/promises";
import { createDatabase } from "../src/platform/database/connection.ts";
import { readConfig } from "../src/platform/config.ts";
import { createOnboarding, createAssessmentMedia, createS3AssessmentStorage, createGoogleBookingProvider, createMarketingPermissions } from "../src/features/onboarding/index.ts";
import { isRecord } from "../src/shared/validation.ts";

const [command, accountOrFile, detailsFile] = process.argv.slice(2);
const configuration = readConfig(process.env);
if (!configuration.ok || !command) {
  console.error("Configure this app’s environment, then use onboarding:admin configure CONTENT.json | configure-marketing RELEASE.json | request-story ACCOUNT_ID STORY.json | review ACCOUNT_ID OUTPUT.json | review-marketing ACCOUNT_ID OUTPUT.json | download ACCOUNT_ID DETAILS.json | resolve ACCOUNT_ID DETAILS.json | sync-booking ACCOUNT_ID | cleanup");
  process.exitCode = 1;
} else {
  const config = configuration.value, db = createDatabase(config.databaseUrl), onboarding = createOnboarding({ db }), marketing = createMarketingPermissions({ db });
  const accountId = accountOrFile ?? "";
  try {
    if (command === "configure" && accountOrFile) {
      const content: unknown = JSON.parse(await readFile(accountOrFile, "utf8"));
      const result = await onboarding.configure({ content }); console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
    } else if (command === "configure-marketing" && accountOrFile) {
      const release: unknown = JSON.parse(await readFile(accountOrFile, "utf8"));
      const result = await marketing.configure({ release }); console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
    } else if (command === "cleanup" && config.assessmentStorage) {
      const result = await createAssessmentMedia({ db, storage: createS3AssessmentStorage(config.assessmentStorage) }).cleanup();
      console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
    } else if (!/^[a-f0-9-]{36}$/.test(accountId)) { console.error("Supply a valid account ID."); process.exitCode = 1; }
    else if (command === "review-marketing" && detailsFile) {
      const result = await marketing.history({ accountId });
      if (!result.ok) { console.error(result.error.message); process.exitCode = 1; }
      else { await writeFile(detailsFile, JSON.stringify(result.value, null, 2), { mode: 0o600, flag: "wx" }); console.log("Private marketing permission history written to the requested new file."); }
    } else if (command === "request-story" && detailsFile) {
      const story: unknown = JSON.parse(await readFile(detailsFile, "utf8"));
      const result = await marketing.requestStory({ accountId, story });
      console.log(JSON.stringify(result.ok ? { ok: true, id: result.value.id, reviewPath: "/account/media" } : result)); if (!result.ok) process.exitCode = 1;
    } else if (command === "review" && detailsFile) {
      const result = await onboarding.get({ accountId });
      if (!result.ok) { console.error(result.error.message); process.exitCode = 1; }
      else { await writeFile(detailsFile, JSON.stringify(result.value, null, 2), { mode: 0o600, flag: "wx" }); console.log("Private onboarding review written to the requested new file."); }
    } else if (command === "download" && detailsFile && config.assessmentStorage) {
      const details: unknown = JSON.parse(await readFile(detailsFile, "utf8"));
      if (!isRecord(details) || typeof details.outputPath !== "string") throw new Error("Invalid download details");
      const result = await createAssessmentMedia({ db, storage: createS3AssessmentStorage(config.assessmentStorage) }).read({ accountId, id: details.mediaId });
      if (!result.ok) { console.error(result.error.message); process.exitCode = 1; }
      else {
        const response = await fetch(result.value.url, { signal: AbortSignal.timeout(120000), redirect: "error" });
        if (!response.ok || !response.body) throw new Error("Download failed");
        const file = await open(details.outputPath, "wx", 0o600); let succeeded = false;
        try {
          const reader = response.body.getReader(); let size = 0;
          for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 250 * 1024 * 1024) { await reader.cancel(); throw new Error("File too large"); } await file.writeFile(chunk.value); }
          succeeded = true;
        } finally { await file.close(); if (!succeeded) await rm(details.outputPath, { force: true }); }
        console.log("Private assessment file downloaded to the requested new file.");
      }
    } else if (command === "resolve" && detailsFile) {
      const details: unknown = JSON.parse(await readFile(detailsFile, "utf8"));
      if (!isRecord(details)) throw new Error("Invalid resolution");
      const result = await onboarding.resolveRequirement({ accountId, requirement: details.requirement, reason: details.reason, resolvedBy: details.resolvedBy });
      console.log(JSON.stringify(result.ok ? { ok: true, revision: result.value.revision } : result)); if (!result.ok) process.exitCode = 1;
    } else if (command === "sync-booking" && config.googleBooking) {
      const current = await onboarding.get({ accountId });
      if (!current.ok) { console.error(current.error.message); process.exitCode = 1; }
      else {
        const verified = await createGoogleBookingProvider(config.googleBooking).find({ accountId, previous: current.value.booking });
        if (!verified.ok) { console.error(verified.error.message); process.exitCode = 1; }
        else if (!verified.value) { console.log("No verified account-linked appointment found."); process.exitCode = 1; }
        else { const result = await onboarding.recordBooking({ accountId, booking: verified.value }); console.log(JSON.stringify(result.ok ? { ok: true, revision: result.value.revision, bookingStatus: result.value.booking?.status } : result)); if (!result.ok) process.exitCode = 1; }
      }
    } else { console.error("Unknown command, missing file argument, or required integration is not configured."); process.exitCode = 1; }
  } catch { console.error("Onboarding administration failed. Check the command, configuration and private input files."); process.exitCode = 1; }
  finally { await db.destroy(); }
}
