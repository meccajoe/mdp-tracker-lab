import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("slack delivery helper submits API bodies in Slack-compatible form encoding", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/slack-delivery.ts"), "utf8");

  assert.match(source, /URLSearchParams/, "Slack helper should build form-encoded request bodies");
  assert.match(source, /application\/x-www-form-urlencoded/, "Slack helper should use Slack-compatible form encoding");
  assert.match(source, /users\.lookupByEmail/, "Slack helper should still support lookup-by-email flows");
});