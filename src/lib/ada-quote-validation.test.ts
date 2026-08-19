import assert from "node:assert/strict";
import test from "node:test";

import { validateAdaQuoteSnapshot } from "./ada-quote-validation";

const validLine = { itemName: "SEG fabric", buildItem: "Back Wall", lineType: "material", internalCost: 500, clientPrice: 900, confidence: "high", evidenceRefs: ["materials:seg"] };

test("Ada derives canonical totals from validated quote lines", () => {
  const result = validateAdaQuoteSnapshot({ lineItems: [validLine, { ...validLine, itemName: "Install labor", lineType: "labor", internalCost: 300, clientPrice: 600 }] }, ["Finish pending"], [{ sourceId: "materials:seg" }]);
  assert.deepEqual(result.totals, { internalCost: 800, sellPrice: 1500, marginPct: 46.666666666666664 });
  assert.equal(result.quoteJson.lineItems.length, 2);
});

test("Ada rejects malformed or unsafe quote lines", () => {
  assert.throws(() => validateAdaQuoteSnapshot({ lineItems: [{ ...validLine, internalCost: -1 }] }), /invalid quote line/i);
  assert.throws(() => validateAdaQuoteSnapshot({ lineItems: [{ ...validLine, buildItem: "" }] }), /invalid quote line/i);
  assert.throws(() => validateAdaQuoteSnapshot({ lineItems: [{ ...validLine, confidence: "certain" }] }), /invalid quote line/i);
  assert.throws(() => validateAdaQuoteSnapshot({ lineItems: [{ ...validLine, evidenceRefs: [42] }] }), /invalid quote line/i);
});

test("Ada normalizes assumptions and evidence without trusting client totals", () => {
  const result = validateAdaQuoteSnapshot({ lineItems: [validLine] }, ["  Confirm finish  ", 42 as unknown as string], [{ sourceId: "x" }]);
  assert.deepEqual(result.assumptions, ["Confirm finish"]);
  assert.deepEqual(result.evidence, [{ sourceId: "x" }]);
  assert.equal(result.totals.sellPrice, 900);
});
