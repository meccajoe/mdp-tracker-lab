import assert from "node:assert/strict";
import test from "node:test";

const source = await import(`../src/lib/labor-rate-source.ts?test=${Date.now()}`);

test("uses TSheets entries with a positive pay rate as the canonical labor-cost source", () => {
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "ts_811", hourly_rate: 27 }), true);
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "ts_811", hourly_rate: 0 }), false);
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "811", hourly_rate: 27 }), false);
});

test("builds the TSheets query filter used by labor reporting surfaces", () => {
  assert.deepEqual(source.canonicalLaborCostQueryFilter(), {
    column: "qbo_entry_id",
    operator: "like",
    value: "ts_%",
  });
});
