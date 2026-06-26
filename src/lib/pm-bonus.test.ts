import assert from "node:assert/strict";
import test from "node:test";

import { buildPmBonusRows } from "./pm-bonus.ts";

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
  assert.equal(rows[0].profit_margin, 1200 / 9500);
  assert.equal(rows[0].bonus_rate, 0);
  assert.equal(rows[0].bonus, 0);
  assert.equal(rows[0].qbo_income, 9500);
  assert.equal(rows[0].qbo_expenses, 8300);
  assert.equal(rows[0].bonus_source, "qbo");
});

test("buildPmBonusRows applies 0.50 percent bonus rate for 30 to 39.9 percent margin", () => {
  const rows = buildPmBonusRows(
    [{ id: "p30", name: "Thirty Margin", client: "A", close_date: "2026-06-20", contract_amount: 10000, total_spent: 0 }],
    new Map([["p30", { project_id: "p30", qbo_income: 10000, qbo_expenses: 6500, qbo_net_income: 3500, synced_at: "2026-06-25T12:00:00Z" }]])
  );

  assert.equal(rows[0].profit_margin, 0.35);
  assert.equal(rows[0].bonus_rate, 0.005);
  assert.equal(rows[0].bonus, 17.5);
});

test("buildPmBonusRows applies 0.75 percent bonus rate for 40 to 49.9 percent margin", () => {
  const rows = buildPmBonusRows(
    [{ id: "p40", name: "Forty Margin", client: "A", close_date: "2026-06-20", contract_amount: 10000, total_spent: 0 }],
    new Map([["p40", { project_id: "p40", qbo_income: 10000, qbo_expenses: 5500, qbo_net_income: 4500, synced_at: "2026-06-25T12:00:00Z" }]])
  );

  assert.equal(rows[0].profit_margin, 0.45);
  assert.equal(rows[0].bonus_rate, 0.0075);
  assert.equal(rows[0].bonus, 33.75);
});

test("buildPmBonusRows applies 1.00 percent bonus rate for 50 percent plus margin", () => {
  const rows = buildPmBonusRows(
    [{ id: "p50", name: "Fifty Margin", client: "A", close_date: "2026-06-20", contract_amount: 10000, total_spent: 0 }],
    new Map([["p50", { project_id: "p50", qbo_income: 10000, qbo_expenses: 4800, qbo_net_income: 5200, synced_at: "2026-06-25T12:00:00Z" }]])
  );

  assert.equal(rows[0].profit_margin, 0.52);
  assert.equal(rows[0].bonus_rate, 0.01);
  assert.equal(rows[0].bonus, 52);
});

test("buildPmBonusRows floors negative QBO profit to zero bonus and zero rate", () => {
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
  assert.equal(rows[0].profit_margin, -2000 / 12000);
  assert.equal(rows[0].bonus_rate, 0);
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
  assert.equal(rows[0].profit_margin, null);
  assert.equal(rows[0].bonus_rate, 0);
  assert.equal(rows[0].bonus, 0);
  assert.equal(rows[0].bonus_source, "missing_qbo");
});

test("buildPmBonusRows keeps bonus per-project instead of netting gains and losses across projects", () => {
  const rows = buildPmBonusRows(
    [
      {
        id: "p4",
        name: "Winning Job",
        client: "Client A",
        close_date: "2026-06-23",
        contract_amount: 10000,
        total_spent: 0,
      },
      {
        id: "p5",
        name: "Losing Job",
        client: "Client B",
        close_date: "2026-06-24",
        contract_amount: 10000,
        total_spent: 0,
      },
    ],
    new Map([
      [
        "p4",
        {
          project_id: "p4",
          qbo_income: 10000,
          qbo_expenses: 5000,
          qbo_net_income: 5000,
          synced_at: "2026-06-25T12:00:00Z",
        },
      ],
      [
        "p5",
        {
          project_id: "p5",
          qbo_income: 10000,
          qbo_expenses: 13000,
          qbo_net_income: -3000,
          synced_at: "2026-06-25T12:00:00Z",
        },
      ],
    ])
  );

  assert.equal(rows[0].bonus_rate, 0.01);
  assert.equal(rows[0].bonus, 50);
  assert.equal(rows[1].bonus_rate, 0);
  assert.equal(rows[1].bonus, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.bonus, 0), 50);
});
