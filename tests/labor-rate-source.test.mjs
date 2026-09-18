import assert from "node:assert/strict";
import test from "node:test";

const source = await import(`../src/lib/labor-rate-source.ts?test=${Date.now()}`);

test("requires approved QBO Time provenance before valuing a positive labor rate", () => {
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "ts_811", hourly_rate: 27, rate_source: "qbo_time_users" }), true);
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "ts_812", hourly_rate: 27, rate_source: "qbo_time_users_matched" }), true);
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "ts_813", hourly_rate: 30, rate_source: null }), false);
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "ts_814", hourly_rate: 0, rate_source: "qbo_time_users" }), false);
  assert.equal(source.isCanonicalLaborCostEntry({ qbo_entry_id: "814", hourly_rate: 27, rate_source: "qbo_time_users" }), false);
});

test("preserves a previously verified historical rate when the current user profile has no rate", () => {
  assert.deepEqual(source.resolveLaborRateForSync(
    { hourly_rate: 24, rate_source: "qbo_time_users", rate_verified_at: "2026-06-01T00:00:00Z" },
    { hourly_rate: null, rate_source: null, rate_verified_at: null },
  ), { hourly_rate: 24, rate_source: "qbo_time_users", rate_verified_at: "2026-06-01T00:00:00Z" });
});

test("does not preserve a legacy positive rate with no approved provenance", () => {
  assert.deepEqual(source.resolveLaborRateForSync(
    { hourly_rate: 30, rate_source: null, rate_verified_at: null },
    { hourly_rate: null, rate_source: null, rate_verified_at: null },
  ), { hourly_rate: null, rate_source: null, rate_verified_at: null });
});

test("accepts a newly verified rate for an unrated entry", () => {
  assert.deepEqual(source.resolveLaborRateForSync(
    { hourly_rate: null, rate_source: null, rate_verified_at: null },
    { hourly_rate: 29, rate_source: "qbo_time_users", rate_verified_at: "2026-09-18T00:00:00Z" },
  ), { hourly_rate: 29, rate_source: "qbo_time_users", rate_verified_at: "2026-09-18T00:00:00Z" });
});

test("builds the TSheets query filter used by labor reporting surfaces", () => {
  assert.deepEqual(source.canonicalLaborCostQueryFilter(), {
    column: "qbo_entry_id",
    operator: "like",
    value: "ts_%",
  });
});
