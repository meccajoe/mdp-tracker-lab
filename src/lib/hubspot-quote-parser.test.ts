import assert from "node:assert/strict";
import test from "node:test";
import { parseLineItems, calculateBudgets } from "./hubspot-quote-parser.ts";

test("parseLineItems classifies fabrication and crating explicitly while keeping graphics and storage out of fabrication", () => {
  const parsed = parseLineItems([
    { name: "Main Fabrication", sku: "400100", amount: 40000 },
    { name: "Custom Crating", sku: "400404", amount: 5000 },
    { name: "Graphics Package", sku: "400800", amount: 12000 },
    { name: "Storage", sku: "400500", amount: 3000 },
  ]);

  assert.equal(parsed.contractAmount, 60000);
  assert.equal(parsed.quotes.fabrication, 40000);
  assert.equal(parsed.quotes.crating, 5000);
  assert.equal(parsed.quotes.flooring, 0);
  assert.equal(parsed.quotes.shipping, 0);
});

test("calculateBudgets derives labor and materials from fabrication subtotal only", async () => {
  const budgets = await calculateBudgets({
    contractAmount: 100000,
    quotes: {
      fabrication: 40000,
      design: 10000,
      pm: 5000,
      shipping: 8000,
      id_labor: 7000,
      travel: 6000,
      props: 2000,
      equipment: 3000,
      rental: 4000,
      flooring: 12000,
      crating: 5000,
    },
    reclassified: [],
  });

  assert.equal(budgets.budget_materials, 10000);
  assert.equal(budgets.budget_hrs, 244);
  assert.equal(budgets.budget_crating, 3000);
  assert.equal(budgets.budget_shipping, 5600);
  assert.equal(budgets.budget_flooring, 7800);
});

test("calculateBudgets leaves labor and materials null when fabrication subtotal is zero", async () => {
  const budgets = await calculateBudgets({
    contractAmount: 50000,
    quotes: {
      fabrication: 0,
      design: 0,
      pm: 0,
      shipping: 10000,
      id_labor: 0,
      travel: 0,
      props: 0,
      equipment: 0,
      rental: 0,
      flooring: 10000,
      crating: 0,
    },
    reclassified: [],
  });

  assert.equal(budgets.budget_hrs, null);
  assert.equal(budgets.budget_materials, null);
});
