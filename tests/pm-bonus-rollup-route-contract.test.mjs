import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const summaryPagePath = path.join(repoRoot, "src", "app", "pm", "page.tsx");
const sidebarPath = path.join(repoRoot, "src", "components", "Sidebar.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("admin-only PM team bonus summary route exists and uses rollup chart/table labels", () => {
  const source = read(summaryPagePath);
  assert.match(source, /Team Bonus Summary/);
  assert.match(source, /YTD Total/);
  assert.match(source, /Monthly Bonus Trend|Monthly Bonus Rollup/);
  assert.match(source, /buildPmBonusMonthlyRollup/);
  assert.match(source, /BarChart|ResponsiveContainer/);
  assert.match(source, /canSeeTeamBonuses/);
  assert.match(source, /\.eq\("role",\s*"pm"\)/);
});

test("sidebar exposes admin team summary link and only PM-classified users under Team Bonuses", () => {
  const source = read(sidebarPath);
  assert.match(source, /href="\/pm"|href=\{`\/pm`\}/);
  assert.match(source, /Team Summary|All PMs|Bonus Summary/);
  assert.match(source, /\.eq\("role",\s*"pm"\)/);
  assert.doesNotMatch(source, /eq\("show_in_filters",\s*true\)/);
});
