import assert from "node:assert/strict";
import test from "node:test";

import { buildPmBonusMonthlyRollup } from "./pm-bonus-rollup.ts";

test("buildPmBonusMonthlyRollup groups completed-project bonuses by PM and close month with YTD totals", () => {
  const rows = [
    { id: "1", name: "A", client: "C", close_date: "2026-01-15", contract_amount: 10000, qbo_income: 10000, qbo_expenses: 6500, gross_profit: 3500, profit_margin: 0.35, bonus_rate: 0.005, bonus: 17.5, qbo_synced_at: "2026-06-26T00:00:00Z", bonus_source: "qbo" },
    { id: "2", name: "B", client: "C", close_date: "2026-02-10", contract_amount: 10000, qbo_income: 10000, qbo_expenses: 5000, gross_profit: 5000, profit_margin: 0.5, bonus_rate: 0.01, bonus: 50, qbo_synced_at: "2026-06-26T00:00:00Z", bonus_source: "qbo" },
    { id: "3", name: "C", client: "C", close_date: "2026-02-20", contract_amount: 10000, qbo_income: 10000, qbo_expenses: 5500, gross_profit: 4500, profit_margin: 0.45, bonus_rate: 0.0075, bonus: 33.75, qbo_synced_at: "2026-06-26T00:00:00Z", bonus_source: "qbo" },
  ] as const;

  const projectsByPm = new Map([
    ["MS", [rows[0], rows[1]]],
    ["DG", [rows[2]]],
  ]);

  const result = buildPmBonusMonthlyRollup(projectsByPm, 2026);

  assert.equal(result.monthKeys[0], "2026-01");
  assert.equal(result.monthKeys[1], "2026-02");
  assert.deepEqual(result.pmRows[0].pmInitials, "DG");
  assert.equal(result.pmRows[0].ytdBonus, 33.75);
  assert.equal(result.pmRows[0].monthBonuses["2026-02"], 33.75);
  assert.equal(result.pmRows[1].pmInitials, "MS");
  assert.equal(result.pmRows[1].monthBonuses["2026-01"], 17.5);
  assert.equal(result.pmRows[1].monthBonuses["2026-02"], 50);
  assert.equal(result.pmRows[1].ytdBonus, 67.5);
  assert.equal(result.monthTotals["2026-01"], 17.5);
  assert.equal(result.monthTotals["2026-02"], 83.75);
  assert.equal(result.ytdTotal, 101.25);
});
