import assert from "node:assert/strict";
import test from "node:test";

import { quoteRevisionToSheetValues } from "./ada-quote-workbook";

test("Ada Sheet totals and margin formulas reference the actual summary rows", () => {
  const rows = quoteRevisionToSheetValues({
    revision_number: 1,
    internal_cost: 150,
    sell_price: 250,
    margin_pct: 40,
    assumptions_json: [],
    quote_json: {
      lineItems: [
        { itemName: "Material", lineType: "material", internalCost: 100, clientPrice: 160 },
        { itemName: "Labor", lineType: "labor", internalCost: 50, clientPrice: 90 },
      ],
    },
  }, "Formula QA");

  assert.deepEqual(rows[7], ["Internal Cost", "", "", "", "", "=SUM(E5:E6)"]);
  assert.deepEqual(rows[8], ["Sell Price", "", "", "", "", "=SUM(F5:F6)"]);
  assert.deepEqual(rows[9], ["Margin", "", "", "", "", "=IF(F9=0,0,(F9-F8)/F9)"]);
});
