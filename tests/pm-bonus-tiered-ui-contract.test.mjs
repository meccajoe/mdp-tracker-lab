import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pagePath = path.join(repoRoot, "src", "app", "pm", "[initials]", "page.tsx");
const source = fs.readFileSync(pagePath, "utf8");

test("PM bonus page shows project profit margin and tiered bonus labels", () => {
  assert.match(source, /Project Profit Margin/);
  assert.match(source, /Bonus Rate/);
  assert.match(source, /Tiered QBO-based bonus projection/);
  assert.match(source, /0\.50%|0\.75%|1\.00%/);
});
