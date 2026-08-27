import assert from "node:assert/strict";
import test from "node:test";
import { assessPostmortemFreshness } from "./project-postmortem-freshness.ts";

const base = {
  labor: { rate_coverage: { total_hours: 10, verified_hours: 8, missing_rate_hours: 2 }, calculated_base_wage_cost: 200 },
  expense_summary: [{ category: "Fabrication", amount: 50 }],
  issues: [{ id: "issue-1" }],
  quote_lines: [{ id: "line-1", line_total: 100 }],
};

test("reports a current post-mortem when source facts match", () => {
  assert.deepEqual(assessPostmortemFreshness(base, base), { status: "current", changes: [] });
});

test("reports each changed source domain", () => {
  const current = {
    labor: { rate_coverage: { total_hours: 12, verified_hours: 8, missing_rate_hours: 4 }, calculated_base_wage_cost: 200 },
    expense_summary: [{ category: "Fabrication", amount: 75 }],
    issues: [{ id: "issue-2" }],
    quote_lines: [{ id: "line-1", line_total: 125 }],
  };
  assert.deepEqual(assessPostmortemFreshness(base, current), { status: "stale", changes: ["labor", "expenses", "issues", "quote"] });
});
