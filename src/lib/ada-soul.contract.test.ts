import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const soul = join(root, "src/lib/ada-soul.ts");
const quote = join(root, "src/lib/ada-quote-generation.ts");
const vision = join(root, "src/lib/ada-vision.ts");
test("Tracker Ada has one grounded soul shared by quote and vision prompts", () => {
  assert.ok(existsSync(soul));
  const soulSource = readFileSync(soul, "utf8");
  assert.match(soulSource, /ADA_SOUL/);
  assert.match(soulSource, /never invent/i);
  assert.match(soulSource, /one highest-leverage clarification/i);
  assert.match(soulSource, /Tracker evidence/i);
  assert.match(readFileSync(quote, "utf8"), /ADA_SOUL/);
  assert.match(readFileSync(vision, "utf8"), /ADA_SOUL/);
});
