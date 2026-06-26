import assert from "node:assert/strict";
import test from "node:test";

import { buildPmBonusRows, BONUS_RATE } from "./pm-bonus.ts";

test("buildPmBonusRows uses QBO net income as gross profit source instead of tracker spend totals", () => {
  const rows = buildPmBonusRows(
    [
      {
        id: "p1",
        name: "Netflix - Wall of Fame",
        client: "Netflix",
        close_date: "2026-06-20",
        contract_amount: 10000,
        total_spent: 7000,
      },
    ],
    new Map([
      [
        "p1",
        {
          project_id: "p1",
          qbo_income: 9500,
          qbo_expenses: 8300,
          qbo_net_income: 1200,
          synced_at: "2026-06-25T12:00:00Z",
        },
      ],
    ])
  );

  assert.equal(rows[0].gross_profit, 1200);
  assert.equal(rows[0].bonus, 1200 * BONUS_RATE);
  assert.equal(rows[0].qbo_income, 9500);
  assert.equal(rows[0].qbo_expenses, 8300);
  assert.equal(rows[0].bonus_source, "qbo");
});

test("buildPmBonusRows floors negative QBO profit to zero bonus", () => {
  const rows = buildPmBonusRows(
    [
      {
        id: "p2",
        name: "Loss Job",
        client: "Client",
        close_date: "2026-06-21",
        contract_amount: 12000,
        total_spent: 5000,
      },
    ],
    new Map([
      [
        "p2",
        {
          project_id: "p2",
          qbo_income: 12000,
          qbo_expenses: 14000,
          qbo_net_income: -2000,
          synced_at: "2026-06-25T12:00:00Z",
        },
      ],
    ])
  );

  assert.equal(rows[0].gross_profit, -2000);
  assert.equal(rows[0].bonus, 0);
});

test("buildPmBonusRows marks projects without QBO P&L as missing instead of using tracker-only profit math", () => {
  const rows = buildPmBonusRows(
    [
      {
        id: "p3",
        name: "Unsynced Job",
        client: "Client",
        close_date: "2026-06-22",
        contract_amount: 9000,
        total_spent: 1000,
      },
    ],
    new Map()
  );

  assert.equal(rows[0].gross_profit, null);
  assert.equal(rows[0].bonus, 0);
  assert.equal(rows[0].bonus_source, "missing_qbo");
});
