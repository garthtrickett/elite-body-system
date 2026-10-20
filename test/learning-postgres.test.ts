import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../src/features/profile/index.ts";
import { createScorecards } from "../src/features/scorecard/index.ts";
import { createContentMedia } from "../src/features/content/index.ts";
import { createLearning, emptyMap } from "../src/features/learning/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { completedProfile } from "./support/client.ts";

const db = createDatabase(testDatabaseUrl()), media = createContentMedia(db);
const profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => new Date("2026-10-01T12:00:00Z") });
const learning = createLearning({ db, profiles, media, now: () => new Date("2026-10-20T12:00:00Z") });
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); await db.destroy(); });
async function account() { const result = await app.auth.provisionAccount({ email: `learning-${randomUUID()}@example.test` }); assert.ok(result.ok); return result.value.id; }
const writtenMap = () => ({ ...emptyMap(), identity: "I keep promises", build: "A strong future", refuse: "Letting myself down", signals: "More energy", leads: "Being present", final: "Start anyway", step: 6 });

test("Map drafts, completed text and daily reading are persisted only for their owning account", async () => {
  const id = await account(), other = await account();
  await profiles.save({ accountId: id, revision: 0, profile: completedProfile() });
  const partial = await learning.saveMap({ accountId: id, revision: 0, map: { ...emptyMap(), identity: "A draft", step: 2 } }); assert.ok(partial.ok);
  assert.equal((await learning.readMap({ accountId: id })).ok, false);
  const saved = await learning.saveMap({ accountId: id, revision: 1, map: writtenMap(), finish: true }); assert.ok(saved.ok);
  assert.equal(saved.value.mapRevision, 2);
  const read = await learning.readMap({ accountId: id }); assert.ok(read.ok); assert.equal(read.value.mapRead, true);
  const again = await learning.readMap({ accountId: id }); assert.ok(again.ok); assert.equal(again.value.mapRead, true);
  const ownDay = await learning.hasRead({ accountId: id, date: "2026-10-20" }); assert.ok(ownDay.ok && ownDay.value);
  const history = await createScorecards(db).history({ accountId: id }); assert.ok(history.ok); assert.equal(history.value.find(day => day.date === "2026-10-20")?.scorecard.checks.map, true);
  const otherDay = await learning.hasRead({ accountId: id, date: "2026-10-19" }); assert.ok(otherDay.ok && !otherDay.value);
  const isolated = await learning.get({ accountId: other }); assert.ok(isolated.ok); assert.equal(isolated.value.map.identity, ""); assert.equal(isolated.value.mapRead, false);
  const stale = await learning.saveMap({ accountId: id, revision: 1, map: writtenMap() }); assert.ok(!stale.ok); assert.equal(stale.error.code, "conflict");
});

test("course unlocking and answer completion are enforced server-side across pillars", async () => {
  const id = await account(); await profiles.save({ accountId: id, revision: 0, profile: completedProfile() });
  const locked = await learning.saveEpisode({ accountId: id, id: "n1", revision: 0, answers: ["2400 calories", "Three meals"], complete: true }); assert.ok(!locked.ok); assert.equal(locked.error.code, "forbidden");
  const incomplete = await learning.saveEpisode({ accountId: id, id: "m1", revision: 0, answers: ["One answer"], complete: true }); assert.ok(!incomplete.ok); assert.equal(incomplete.error.code, "invalid_input");
  const draft = await learning.saveEpisode({ accountId: id, id: "m1", revision: 0, answers: ["Written identity", ""], complete: false }); assert.ok(draft.ok);
  const complete = await learning.saveEpisode({ accountId: id, id: "m1", revision: 1, answers: ["Written identity", "After breakfast"], complete: true }); assert.ok(complete.ok);
  const next = await learning.saveEpisode({ accountId: id, id: "n1", revision: 2, answers: ["2400 calories", "Three meals"], complete: true }); assert.ok(next.ok);
  const stale = await learning.saveEpisode({ accountId: id, id: "a1", revision: 2, answers: ["Four chosen days", "Two recovery days"], complete: true }); assert.ok(!stale.ok); assert.equal(stale.error.code, "conflict");
  const future = await learning.saveEpisode({ accountId: id, id: "m2", revision: 3, answers: ["Consistent", "Skipping"], complete: true }); assert.ok(!future.ok); assert.equal(future.error.code, "forbidden");
  const loaded = await learning.get({ accountId: id }); assert.ok(loaded.ok); assert.equal(loaded.value.progress.done.m1, true); assert.equal(loaded.value.progress.done.n1, true); assert.deepEqual(loaded.value.progress.answers.m1, ["Written identity", "After breakfast"]);
});

test("video configuration is an explicit trusted operation and rejects active/credential-bearing URLs", async () => {
  for (const url of ["javascript:alert(1)", "http://example.test/video.mp4", "https://user:secret@example.test/video.mp4"]) assert.equal((await media.setVideo({ key: "course:m1", url })).ok, false);
  assert.ok((await media.setVideo({ key: "course:m1", url: "https://example.test/lesson.mp4" })).ok);
  const list = await media.list(); assert.ok(list.ok); assert.equal(list.value["course:m1"], "https://example.test/lesson.mp4");
  assert.ok((await media.setVideo({ key: "course:m1", url: null })).ok);
});
