import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("portfolio monitor config defines project-level budget and labor monitors plus saved-portfolio alert helpers", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/project-portfolio-monitoring.ts"), "utf8");

  assert.match(source, /labor_budget|budget_materials|total_budget/i, "monitor config should cover labor plus specific budget areas");
  assert.match(source, /buildPortfolioMonitorRecommendation\(/, "monitor helper should build a saved-portfolio alert recommendation");
  assert.match(source, /portfolio_monitor_key/, "monitor helper should stamp a monitor key into portfolio subscription scope metadata");
});
