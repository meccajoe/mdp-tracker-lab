import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/components/ui/tabs.tsx"), "utf8");

test("horizontal tabs stack their list above content instead of creating a side rail", () => {
  assert.match(source, /data-\[orientation=horizontal\]:flex-col/);
  assert.match(source, /group-data-\[orientation=horizontal\]\/tabs:h-8/);
  assert.doesNotMatch(source, /data-horizontal:flex-col/);
});
