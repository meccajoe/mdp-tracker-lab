import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const detail = readFileSync(join(process.cwd(), "src/components/ada-workspace-detail.tsx"), "utf8");

test("Ada keeps only the Files icon in its chat header and a left-aligned composer", () => {
  assert.match(detail, /aria-label="Open files"/);
  assert.doesNotMatch(detail, /aria-label="Edit chat"/);
  assert.doesNotMatch(detail, /aria-label="Delete chat"/);
  assert.doesNotMatch(detail, /placeholder:text-center/);
  assert.match(detail, /placeholder="Let’s quote something\.\.\."/);
  assert.match(detail, /rounded-full/);
  assert.match(detail, /aria-label="Send message"/);
});
