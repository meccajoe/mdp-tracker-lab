import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pagePath = path.join(repoRoot, "src", "app", "pm", "[initials]", "page.tsx");
const source = fs.readFileSync(pagePath, "utf8");

test("PM bonus page shows maintenance copy while true QBO project profitability source is being repaired", () => {
  assert.match(source, /PM bonus tracker is temporarily unavailable/i);
  assert.match(source, /QBO project profitability source is being repaired/i);
});

test("PM bonus page does not render Total Bonus Earned hero card while maintenance mode is active", () => {
  assert.doesNotMatch(source, /Total Bonus Earned \(All Time\)/);
});
