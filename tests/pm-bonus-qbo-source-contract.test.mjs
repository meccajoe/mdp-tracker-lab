import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pagePath = path.join(repoRoot, "src", "app", "pm", "[initials]", "page.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("PM bonus page loads QBO project P&L and bonus helper instead of computing gross profit from tracker spend fields alone", () => {
  const source = read(pagePath);

  assert.match(source, /from\("qbo_project_pnl"\)/);
  assert.match(source, /buildPmBonusRows/);
  assert.doesNotMatch(source, /const grossProfit = contract - p\.total_spent/);
});

test("PM bonus page surfaces QBO-backed financial labels for the bonus calculation", () => {
  const source = read(pagePath);

  assert.match(source, /QBO Income|QBO Revenue/);
  assert.match(source, /QBO Expenses/);
  assert.match(source, /QBO Gross Profit|Gross Profit \(QBO\)/);
});

test("PM bonus page copy says the 1 percent bonus is based on each project's own QBO gross profit", () => {
  const source = read(pagePath);

  assert.match(source, /1% of each project's QBO gross profit/);
});
