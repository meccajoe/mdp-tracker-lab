import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBudgetBreakdownTotal,
  buildBudgetPayloadFromProjectQuote,
  buildHubspotQuoteSyncFields,
  buildQuoteCompareRows,
  buildQuoteLineBudgetAllocationRows,
  buildStoredQuoteSnapshotFromParsedQuote,
  getSkuChipClassName,
  stripUnsupportedProjectFields,
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
      storage: 1250,
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
  assert.equal(snapshot.quote_storage, 1250);
  assert.equal(snapshot.quote_flooring, 1930);
});

test("buildStoredQuoteSnapshotFromParsedQuote can apply the fabrication snapshot onto an existing payload", () => {
  const payload = {
    quote_materials: null,
    quote_design: null,
    quote_pm: null,
  };

  Object.assign(
    payload,
    buildStoredQuoteSnapshotFromParsedQuote({
      contractAmount: 5000,
      quotes: {
        fabrication: 2000,
        design: 250,
        pm: 150,
        shipping: 0,
        crating: 0,
        id_labor: 0,
        travel: 0,
        storage: 0,
        props: 0,
        equipment: 0,
        rental: 0,
        flooring: 0,
      },
      reclassified: [],
    })
  );

  assert.equal(payload.quote_materials, 2000);
  assert.equal(payload.quote_design, 250);
  assert.equal(payload.quote_pm, 150);
});

test("buildHubspotQuoteSyncFields merges stored quote snapshot and derived budgets for webhook resyncs", () => {
  const fields = buildHubspotQuoteSyncFields({
    contractAmount: 29055,
    quotes: {
      fabrication: 14330,
      design: 1000,
      pm: 950,
      shipping: 4850,
      crating: 0,
      id_labor: 4145,
      travel: 1850,
      storage: 1250,
      props: 0,
      equipment: 0,
      rental: 0,
      flooring: 1930,
    },
    reclassified: [],
  });

  assert.equal(fields.quote_materials, 14330);
  assert.equal(fields.budget_materials, 3583);
  assert.equal(fields.budget_hrs, 87);
  assert.equal(fields.quote_storage, 1250);
  assert.equal(fields.quote_flooring, 1930);
});

test("stripUnsupportedProjectFields removes crating fields that are not in the live schema", () => {
  const sanitized = stripUnsupportedProjectFields({
    quote_materials: 14330,
    budget_materials: 3583,
    quote_crating: 500,
    budget_crating: 300,
    pct_crating: 60,
    quote_design: 1000,
  });

  assert.equal("quote_crating" in sanitized, false);
  assert.equal("budget_crating" in sanitized, false);
  assert.equal("pct_crating" in sanitized, false);
  assert.equal(sanitized.quote_materials, 14330);
  assert.equal(sanitized.quote_design, 1000);
});

test("stripUnsupportedProjectFields preserves supported project fields used by data-entry saves", () => {
  const sanitized = stripUnsupportedProjectFields({
    name: "Netflix - Wall of Fame",
    client: "Netflix",
    status: "Active",
    quote_materials: 7165,
    budget_materials: 1791,
    pct_materials: 25,
    budget_design: 500,
    quote_design: 1000,
    pct_design: 50,
  });

  assert.equal(sanitized.name, "Netflix - Wall of Fame");
  assert.equal(sanitized.client, "Netflix");
  assert.equal(sanitized.status, "Active");
  assert.equal(sanitized.quote_materials, 7165);
  assert.equal(sanitized.budget_materials, 1791);
  assert.equal(sanitized.pct_materials, 25);
  assert.equal(sanitized.budget_design, 500);
  assert.equal(sanitized.quote_design, 1000);
  assert.equal(sanitized.pct_design, 50);
});

test("stripUnsupportedProjectFields keeps QBO linkage fields while removing unsupported crating budget fields", () => {
  const sanitized = stripUnsupportedProjectFields({
    job_number: "26115",
    qbo_project_id: "12345",
    qbo_project_url: "https://app.qbo.intuit.com/app/customerdetail?nameId=12345",
    budget_crating: 300,
    pct_crating: 60,
    budget_shipping: 900,
  });

  assert.equal(sanitized.qbo_project_id, "12345");
  assert.equal(sanitized.qbo_project_url, "https://app.qbo.intuit.com/app/customerdetail?nameId=12345");
  assert.equal(sanitized.budget_shipping, 900);
  assert.equal("budget_crating" in sanitized, false);
  assert.equal("pct_crating" in sanitized, false);
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
    quote_storage: 1250,
    pct_storage: 60,
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
  assert.equal(budgets.budget_storage, 750);
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
      quote_storage: 1250,
      pct_storage: 60,
      budget_storage: 750,
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
      Storage: 0,
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

test("buildQuoteLineBudgetAllocationRows splits fabrication into labor/material and shipping into non L&M", () => {
  const rows = buildQuoteLineBudgetAllocationRows(
    {
      pct_labor: 25,
      pct_materials: 25,
      pct_shipping: 60,
      pct_storage: 60,
      pct_design: 50,
    },
    [
      {
        source_line_item_id: "1",
        sku: "400100",
        item: "Main Entrance",
        description: "Fabrication work",
        quantity: 1,
        unit_price: 9965,
        line_total: 9965,
        mapped_category: "fabrication",
      },
      {
        source_line_item_id: "2",
        sku: "400403",
        item: "Shipping/Delivery - 30' Truck (Oklahoma)",
        description: "Truck",
        quantity: 1,
        unit_price: 1500,
        line_total: 1500,
        mapped_category: "shipping",
      },
      {
        source_line_item_id: "2b",
        sku: "400500",
        item: "Storage",
        description: "Warehouse storage",
        quantity: 1,
        unit_price: 500,
        line_total: 500,
        mapped_category: "storage",
      },
      {
        source_line_item_id: "3",
        sku: "400700",
        item: "Design Pass",
        description: "Concept design",
        quantity: 2,
        unit_price: 500,
        line_total: 1000,
        mapped_category: "design",
      },
    ]
  );

  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], {
    source_line_item_id: "1",
    sku: "400100",
    item: "Main Entrance",
    description: "Fabrication work",
    quantity: 1,
    unit_price: 9965,
    line_total: 9965,
    mapped_category: "fabrication",
    budget_category_label: "L&M",
    labor_budget: 2491,
    material_budget: 2491,
    non_lm_budget: 0,
  });
  assert.equal(rows[1].labor_budget, 0);
  assert.equal(rows[1].material_budget, 0);
  assert.equal(rows[1].non_lm_budget, 900);
  assert.equal(rows[1].budget_category_label, "Shipping");
  assert.equal(rows[2].non_lm_budget, 300);
  assert.equal(rows[2].budget_category_label, "Storage");
  assert.equal(rows[3].non_lm_budget, 500);
  assert.equal(rows[3].budget_category_label, "Design");
});

test("buildBudgetBreakdownTotal exposes quote-basis totals for each budget row", () => {
  const project = {
    quote_materials: 14330,
    quote_design: 1000,
    quote_pm: 950,
    quote_shipping: 4850,
    quote_crating: 500,
    quote_id_labor: 4145,
    quote_travel: 1850,
    quote_storage: 1250,
    quote_props: 325,
    quote_equipment: 700,
    quote_rental: 900,
    quote_flooring: 1930,
  };

  assert.equal(buildBudgetBreakdownTotal(project, "budget_hrs"), 14330);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_materials"), 14330);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_design"), 1000);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_pm"), 950);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_shipping"), 4850);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_crating"), 500);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_id_labor"), 4145);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_travel"), 1850);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_storage"), 1250);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_props"), 325);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_equipment"), 700);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_rental"), 900);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_flooring"), 1930);
  assert.equal(buildBudgetBreakdownTotal(project, "budget_unknown"), 0);
});

test("getSkuChipClassName returns stable classes for common SKUs and fallbacks", () => {
  assert.match(getSkuChipClassName("400100"), /bg-sky-100/);
  assert.match(getSkuChipClassName("400403"), /bg-amber-100/);
  assert.match(getSkuChipClassName("400700"), /bg-violet-100/);
  assert.match(getSkuChipClassName("409001"), /bg-rose-100/);
  assert.match(getSkuChipClassName("408000"), /bg-teal-100/);
  assert.match(getSkuChipClassName("999999"), /bg-slate-100/);
});

