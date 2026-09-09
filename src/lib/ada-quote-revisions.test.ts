import assert from "node:assert/strict";
import test from "node:test";

import { buildAdaRevisionDelta, calculateAdaRevisionTotals, generateAdaRevisionProposalFromInstruction } from "./ada-quote-revisions";

const line = (itemName: string, internalCost: number, clientPrice: number, buildItem = "Back Wall") => ({
  itemName, buildItem, lineType: "material" as const, internalCost, clientPrice, confidence: "high" as const, evidenceRefs: [], pricingBasis: "user_input" as const,
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
    added: [{ key: "back wall::rush freight::material", itemName: "Rush freight", sellDelta: 500, line: line("Rush freight", 250, 500) }],
    removed: [{ key: "back wall::old crate::material", itemName: "Old crate", sellDelta: -350, line: line("Old crate", 200, 350) }],
    changed: [{ key: "back wall::seg::material", itemName: "SEG", internalCostDelta: 100, sellDelta: 150, before: line("SEG", 500, 900), after: line("SEG", 600, 1050) }],
    internalCostDelta: 150,
    sellPriceDelta: 300,
  });
});

test("Ada preserves duplicate lines and metadata-only changes in revision deltas", () => {
  const first = {
    ...line("SEG", 10, 20),
    confidence: "medium" as const,
    evidenceRefs: ["asset:drawing-1:page:1"],
  };
  const second = { ...first, internalCost: 12, clientPrice: 24 };
  const changed = { ...first, confidence: "high" as const, assumption: "Confirmed finish" };
  const delta = buildAdaRevisionDelta([first, second], [changed]);

  assert.equal(delta.changed.length, 1);
  assert.deepEqual(delta.changed[0].before, first);
  assert.deepEqual(delta.changed[0].after, changed);
  assert.equal(delta.removed.length, 1);
  assert.deepEqual(delta.removed[0].line, second);
  assert.equal(delta.sellPriceDelta, -24);
});

test("Ada generates a validated proposal snapshot and delta without persistence", async () => {
  const currentRevision = { id: "revision-1", revision_number: 2, quote_json: { lineItems: [line("SEG", 500, 900)] } };
  const generated = await generateAdaRevisionProposalFromInstruction({
    workspaceId: "workspace-1",
    instruction: "Increase SEG",
    currentRevision,
    messages: [{ content: "Increase SEG" }],
    assets: [],
    intelligence: [],
    generateQuote: async () => ({ lineItems: [line("SEG", 600, 1050)], assumptions: ["Updated rate"], evidence: [{ sourceId: "sheet:1" }] }),
  });
  assert.deepEqual(generated.snapshot.quoteJson.lineItems, [line("SEG", 600, 1050)]);
  assert.deepEqual(generated.snapshot.assumptions, ["Updated rate"]);
  assert.equal(generated.sourceRevisionId, "revision-1");
  assert.deepEqual(generated.proposalDelta, {
    added: [], removed: [], changed: [{ key: "back wall::seg::material", itemName: "SEG", internalCostDelta: 100, sellDelta: 150, before: line("SEG", 500, 900), after: line("SEG", 600, 1050) }], internalCostDelta: 100, sellPriceDelta: 150,
  });
});