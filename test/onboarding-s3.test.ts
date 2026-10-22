import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createS3AssessmentStorage, assessmentUploadOrigin } from "../src/features/onboarding/index.ts";
import { jpegBytes } from "./support/onboarding.ts";

const endpoint = process.env.TEST_ASSESSMENT_S3_ENDPOINT;
test("Railway virtual-hosted uploads and CSP use the same exact bucket origin", async () => {
  const config = { endpoint: "https://t3.storageapi.dev", region: "auto", bucket: "private-assessments", accessKeyId: "fixture", secretAccessKey: "fixture" };
  for (const forcePathStyle of [true, false]) {
    const settings = { ...config, forcePathStyle };
    const upload = await createS3AssessmentStorage(settings).authorizeUpload({ key: "onboarding/pending/test", mediaType: "image/jpeg", size: 123 });
    assert.equal(new URL(upload.url).origin, assessmentUploadOrigin(settings));
    assert.equal(new URL(upload.url).hostname, forcePathStyle ? "t3.storageapi.dev" : "private-assessments.t3.storageapi.dev");
  }
});
test("S3 assessment adapter uploads, checks metadata/signatures, copies immutable ready objects, signs reads and deletes", { skip: !endpoint }, async () => {
  const storage = createS3AssessmentStorage({ endpoint: endpoint!, region: "us-east-1", bucket: "onboarding-test", accessKeyId: "fixture", secretAccessKey: "fixture" });
  const id = randomUUID(), pendingKey = `onboarding/pending/fixture/${id}`, readyKey = `onboarding/ready/fixture/${id}`;
  const authorized = await storage.authorizeUpload({ key: pendingKey, mediaType: "image/jpeg", size: jpegBytes.length });
  assert.match(authorized.url, /X-Amz-Expires=600/);
  const put = await fetch(authorized.url, { method: "PUT", headers: authorized.headers, body: jpegBytes }); assert.equal(put.ok, true, await put.text());
  assert.equal(await storage.finalize({ pendingKey, readyKey, mediaType: "image/jpeg", size: jpegBytes.length + 1 }), false);
  assert.equal(await storage.finalize({ pendingKey, readyKey, mediaType: "image/jpeg", size: jpegBytes.length }), true);
  const readUrl = await storage.authorizeRead({ key: readyKey }); assert.match(readUrl, /X-Amz-Expires=120/);
  const read = await fetch(readUrl); assert.equal(read.ok, true); assert.deepEqual(Buffer.from(await read.arrayBuffer()), jpegBytes);
  const overwrite = await fetch(authorized.url, { method: "PUT", headers: authorized.headers, body: Buffer.alloc(jpegBytes.length) }); assert.equal(overwrite.ok, true);
  assert.deepEqual(Buffer.from(await (await fetch(await storage.authorizeRead({ key: readyKey }))).arrayBuffer()), jpegBytes);
  assert.equal(await storage.finalize({ pendingKey, readyKey: readyKey + "-invalid", mediaType: "image/jpeg", size: jpegBytes.length }), false);
  assert.ok((await storage.listExpired({ before: new Date(Date.now() + 60000) })).includes(readyKey));
  await storage.remove({ key: readyKey }); await storage.remove({ key: pendingKey });
  assert.equal((await fetch(readUrl)).status, 404);
});
