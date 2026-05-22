import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBudgetPayloadFromProjectQuote,
  buildQuoteCompareRows,
  buildStoredQuoteSnapshotFromParsedQuote,
} from "./project-rebaseline.ts";

test("buildStoredQuoteSnapshotFromParsedQuote stores fabrication subtotal as the L&M quote basis", () => {
  const snapshot = buildStoredQuoteSnapshotFromParsedQuote({
    contractAmount: 29055,
    quotes: {
      fabrication: 14330,
      design: 1000,
      pm: 950,
      shipping: 4850,
      crating: 0,
      id_labor: 4145,
      travel: 1850,
      props: 0,
      equipment: 0,
      rental: 0,
      flooring: 1930,
    },
    reclassified: [],
  });

  assert.equal(snapshot.quote_materials, 14330);
  assert.equal(snapshot.quote_design, 1000);
  assert.equal(snapshot.quote_pm, 950);
  assert.equal(snapshot.quote_shipping, 4850);
  assert.equal(snapshot.quote_id_labor, 4145);
  assert.equal(snapshot.quote_travel, 1850);
  assert.equal(snapshot.quote_flooring, 1930);
});

test("buildBudgetPayloadFromProjectQuote derives live rebaseline budgets from quote basis and project percentages", () => {
  const budgets = buildBudgetPayloadFromProjectQuote({
    quote_materials: 14330,
    pct_labor: 25,
    pct_materials: 25,
    quote_design: 1000,
    pct_design: 50,
    quote_pm: 950,
    pct_pm: 75,
    quote_shipping: 4850,
    pct_shipping: 70,
    quote_crating: 0,
    pct_crating: 60,
    quote_id_labor: 4145,
    pct_id_labor: 60,
    quote_travel: 1850,
    pct_travel: 75,
    quote_props: 0,
    pct_props: 50,
    quote_equipment: 0,
    pct_equipment: 60,
    quote_rental: 0,
    pct_rental: 60,
    quote_flooring: 1930,
    pct_flooring: 65,
  });

  assert.equal(budgets.budget_materials, 3583);
  assert.equal(budgets.budget_hrs, 87);
  assert.equal(budgets.budget_design, 500);
  assert.equal(budgets.budget_pm, 713);
  assert.equal(budgets.budget_shipping, 3395);
  assert.equal(budgets.budget_id_labor, 2487);
  assert.equal(budgets.budget_travel, 1388);
  assert.equal(budgets.budget_flooring, 1255);
});

test("buildQuoteCompareRows shows zero variance after a fresh rebaseline", () => {
  const rows = buildQuoteCompareRows(
    {
      quote_materials: 14330,
      pct_labor: 25,
      pct_materials: 25,
      budget_hrs: 87,
      budget_materials: 3583,
      quote_design: 1000,
      pct_design: 50,
      budget_design: 500,
      quote_pm: 950,
      pct_pm: 75,
      budget_pm: 713,
      quote_shipping: 4850,
      pct_shipping: 70,
      budget_shipping: 3395,
      quote_crating: 0,
      pct_crating: 60,
      budget_crating: 0,
      quote_id_labor: 4145,
      pct_id_labor: 60,
      budget_id_labor: 2487,
      quote_travel: 1850,
      pct_travel: 75,
      budget_travel: 1388,
      quote_props: 0,
      pct_props: 50,
      budget_props: 0,
      quote_equipment: 0,
      pct_equipment: 60,
      budget_equipment: 0,
      quote_rental: 0,
      pct_rental: 60,
      budget_rental: 0,
      quote_flooring: 1930,
      pct_flooring: 65,
      budget_flooring: 1255,
    },
    {
      "Labor Hours": 0,
      Materials: 0,
      Design: 0,
      "Project Management": 0,
      Shipping: 0,
      Crating: 0,
      "I&D Labor": 0,
      Travel: 0,
      "Props/Decor": 0,
      Equipment: 0,
      Rental: 0,
      "Flooring/Graphics": 0,
    }
  );

  const lmRow = rows.find((row) => row.category === "L&M");
  const designRow = rows.find((row) => row.category === "Design");

  assert.ok(lmRow);
  assert.equal(lmRow?.quote_basis_total, 7150);
  assert.equal(lmRow?.budget_total, 7150);
  assert.equal(lmRow?.variance_quote_to_budget, 0);

  assert.ok(designRow);
  assert.equal(designRow?.quote_basis_total, 500);
  assert.equal(designRow?.budget_total, 500);
  assert.equal(designRow?.variance_quote_to_budget, 0);
});
