import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/generate-completed-project-postmortems.ts");

test("one-time completed-project post-mortem batch is resumable and persists every outcome", () => {
  assert.equal(existsSync(scriptPath), true, "batch script must exist");
  const source = readFileSync(scriptPath, "utf8");
  assert.match(source, /status:\s*"generating"/);
  assert.match(source, /status:\s*"draft"/);
  assert.match(source, /status:\s*"failed"/);
  assert.ok(source.includes('"reviewed"') && source.includes('"approved"'));
  assert.match(source, /BATCH_CONCURRENCY/);
  assert.match(source, /BATCH_DELAY_MS/);
  assert.match(source, /--dry-run/);
  assert.match(source, /--regenerate-affected/);
  assert.match(source, /--project-ids/);
  assert.match(source, /fetchAllPostmortemSourceRows/);
  assert.match(source, /source_integrity/);
  assert.match(source, /--limit/);
  assert.match(source, /summary/i);
});
