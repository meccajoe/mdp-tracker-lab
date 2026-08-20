import assert from "node:assert/strict";
import test from "node:test";

import { parseGeneratedQuote } from "./ada-quote-generation";

const line = {
  itemName: "Painted MDF back wall",
  buildItem: "Back Wall",
  lineType: "material",
  internalCost: 1200,
  clientPrice: 2400,
  confidence: "medium",
  evidenceRefs: ["asset:abc"],
  pricingBasis: "expert_estimate",
  assumption: "Industry-informed material allowance pending supplier confirmation.",
};

test("Ada validates structured quote tool input without parsing model prose", () => {
  const quote = parseGeneratedQuote({ lineItems: [line], assumptions: ["Confirm final finish."], evidence: [{ sourceId: "asset:abc" }] });
  assert.equal(quote.lineItems[0].itemName, "Painted MDF back wall");
  assert.deepEqual(quote.assumptions, ["Confirm final finish."]);
});

test("Ada rejects incomplete structured quote tool input", () => {
  assert.throws(() => parseGeneratedQuote({ lineItems: [{ ...line, assumption: "" }] }), /invalid quote structure/i);
  assert.throws(() => parseGeneratedQuote("{malformed model prose"), /invalid quote structure/i);
});
