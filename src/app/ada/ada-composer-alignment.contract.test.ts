import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const detail = readFileSync(join(process.cwd(), "src/components/ada-workspace-detail.tsx"), "utf8");

test("Ada composer vertically centers attachment, prompt, and send controls", () => {
  assert.match(detail, /grid-cols-\[2\.25rem_minmax\(0,1fr\)_auto\] items-center/);
  assert.doesNotMatch(detail, /grid-cols-\[2\.25rem_minmax\(0,1fr\)_auto\] items-end/);
  assert.match(detail, /min-h-9/);
  assert.match(detail, /h-9 w-9/);
});
