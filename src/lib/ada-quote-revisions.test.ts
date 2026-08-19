import assert from "node:assert/strict";
import test from "node:test";

import { buildAdaRevisionDelta, calculateAdaRevisionTotals } from "./ada-quote-revisions";

const line = (itemName: string, internalCost: number, clientPrice: number, buildItem = "Back Wall") => ({
  itemName, buildItem, lineType: "material" as const, internalCost, clientPrice, confidence: "high" as const, evidenceRefs: [],
});

test("Ada calculates revision totals only from validated line values", () => {
  assert.deepEqual(calculateAdaRevisionTotals([line("SEG", 500, 900), line("Frame", 250, 500)]), {
    internalCost: 750,
    sellPrice: 1400,
    marginPct: 46.42857142857143,
  });
});

test("Ada explains added, removed, and changed quote lines", () => {
  const delta = buildAdaRevisionDelta(
    [line("SEG", 500, 900), line("Old crate", 200, 350)],
    [line("SEG", 600, 1050), line("Rush freight", 250, 500)],
  );
  assert.deepEqual(delta, {
    added: [{ key: "back wall::rush freight::material", itemName: "Rush freight", sellDelta: 500 }],
    removed: [{ key: "back wall::old crate::material", itemName: "Old crate", sellDelta: -350 }],
    changed: [{ key: "back wall::seg::material", itemName: "SEG", internalCostDelta: 100, sellDelta: 150 }],
    internalCostDelta: 150,
    sellPriceDelta: 300,
  });
});
