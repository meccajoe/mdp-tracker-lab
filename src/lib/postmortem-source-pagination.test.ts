import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllPostmortemSourceRows } from "./postmortem-source-pagination.ts";

test("loads every source page past the Supabase 1000-row boundary", async () => {
  const rows = Array.from({ length: 1684 }, (_, index) => ({ id: index + 1 }));
  const ranges: Array<[number, number]> = [];
  const result = await fetchAllPostmortemSourceRows(async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.equal(result.rows.length, 1684);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.equal(result.pageCount, 2);
  assert.equal(result.complete, true);
});

test("fails instead of silently accepting a source page error", async () => {
  await assert.rejects(
    () => fetchAllPostmortemSourceRows(async () => ({ data: null, error: { message: "database unavailable" } })),
    /database unavailable/,
  );
});