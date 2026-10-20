import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("the visual sweep rejects an unrelated database before migrations or fixture writes and does not expose its URL", () => {
  const marker = "private-audit-admission-marker";
  const result = spawnSync(process.execPath, ["test/visual-audit.ts", "must-not-run"], {
    encoding: "utf8", timeout: 10000, env: { ...process.env, DATABASE_URL: `postgresql://${marker}@192.0.2.1:5432/unrelated` },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Visual fixtures require the disposable database/);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes(marker), false);
});
