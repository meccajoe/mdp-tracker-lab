import assert from "node:assert/strict";
import test from "node:test";

import { buildPayrollRateAuthorityRecords, classifyPayrollRateRows, parsePayrollDate } from "./payroll-rate-authority";

const source = {
  sourceLabel: "Friday payroll rates",
  sourceModifiedAt: "2026-08-14T16:21:36.000Z",
  baselineDate: "2025-02-10",
};

test("builds an effective-dated prior and current rate from an explicit increase note", () => {
  const records = buildPayrollRateAuthorityRecords([
    { employee: "Worker A", classification: "C", standardRate: 24, note: "increase from $22 effective 3/2/26", sourceRowNumber: 10 },
  ], source, new Map([["worker a", "2025-07-01"]]));

  assert.deepEqual(records, [
    { normalizedName: "worker a", displayName: "Worker A", classification: "contractor", baseHourlyRate: 22, effectiveStartDate: "2025-07-01", effectiveEndDate: "2026-03-01", sourceLabel: source.sourceLabel, sourceModifiedAt: source.sourceModifiedAt, sourceNote: "increase from $22 effective 3/2/26", sourceRowNumber: 10 },
    { normalizedName: "worker a", displayName: "Worker A", classification: "contractor", baseHourlyRate: 24, effectiveStartDate: "2026-03-02", effectiveEndDate: null, sourceLabel: source.sourceLabel, sourceModifiedAt: source.sourceModifiedAt, sourceNote: "increase from $22 effective 3/2/26", sourceRowNumber: 10 },
  ]);
});

test("does not invent a prior interval when observed work begins after the rate increase", () => {
  const records = buildPayrollRateAuthorityRecords([
    { employee: "Worker A", classification: "E", standardRate: 25, note: "increase from $21 effective 9/15/25", sourceRowNumber: 30 },
  ], source, new Map([["worker a", "2025-10-01"]]));

  assert.deepEqual(records.map((record) => [record.baseHourlyRate, record.effectiveStartDate]), [[25, "2025-09-15"]]);
});

test("uses an authoritative observed-work date for a newly added worker", () => {
  const records = buildPayrollRateAuthorityRecords([
    { employee: "Worker B", classification: "E", standardRate: 26, note: "", sourceRowNumber: 85 },
  ], source, new Map([["worker b", "2026-07-27"]]));

  assert.equal(records[0].effectiveStartDate, "2026-07-27");
  assert.equal(records[0].classification, "employee");
});

test("skips a terminated profile unless the note documents a rehire", () => {
  const records = buildPayrollRateAuthorityRecords([
    { employee: "Worker C", classification: "C", standardRate: 37.5, note: "Terminated", sourceRowNumber: 5 },
    { employee: "Worker D", classification: "C", standardRate: 30, note: "Terminated, rehired as contractor mid-December 2025.", sourceRowNumber: 64 },
  ], source, new Map());

  assert.deepEqual(records.map((record) => record.normalizedName), ["worker d"]);
  assert.equal(records[0].effectiveStartDate, "2025-12-15");
});

test("active duplicate beats a later terminated duplicate while last active resolves active conflicts", () => {
  const records = buildPayrollRateAuthorityRecords([
    { employee: "Santiago Moreno", classification: "E", standardRate: 20, note: "", sourceRowNumber: 76 },
    { employee: "Santiago Moreno", classification: "C", standardRate: 20, note: "Terminated", sourceRowNumber: 77 },
    { employee: "Rogelio Cervantes", classification: "C", standardRate: 23, note: "", sourceRowNumber: 72 },
    { employee: "Rogelio Cervantes", classification: "E", standardRate: 23, note: "", sourceRowNumber: 84 },
  ], source, new Map());

  const santiago = records.find((record) => record.normalizedName === "santiago moreno");
  const rogelio = records.find((record) => record.normalizedName === "rogelio cervantes");
  assert.equal(santiago?.classification, "employee");
  assert.equal(santiago?.sourceRowNumber, 76);
  assert.equal(rogelio?.classification, "employee");
  assert.equal(rogelio?.sourceRowNumber, 84);
});

test("parses documented month/year and yearless rehire dates conservatively", () => {
  const records = buildPayrollRateAuthorityRecords([
    { employee: "Worker E", classification: "C", standardRate: 28, note: "New - Nov 2025 start date.", sourceRowNumber: 40 },
    { employee: "Worker F", classification: "C", standardRate: 25, note: "Re-hired FT contractor on 10/14", sourceRowNumber: 31 },
  ], source, new Map([["worker e", "2025-11-10"]]));

  assert.equal(records.find((record) => record.normalizedName === "worker e")?.effectiveStartDate, "2025-11-10");
  assert.equal(records.find((record) => record.normalizedName === "worker f")?.effectiveStartDate, "2025-10-14");
});

test("rejects impossible full and yearless dates before preview or import", () => {
  assert.throws(() => parsePayrollDate("2/30/2026"), /invalid calendar date/i);
  assert.throws(() => buildPayrollRateAuthorityRecords([
    { employee: "Worker G", classification: "E", standardRate: 20, note: "hired 2/30/2026", sourceRowNumber: 50 },
  ], source, new Map()), /invalid calendar date/i);

  assert.throws(() => buildPayrollRateAuthorityRecords([
    { employee: "Worker H", classification: "C", standardRate: 20, note: "Re-hired on 2/30", sourceRowNumber: 51 },
  ], source, new Map()), /invalid calendar date/i);
});

test("reports explicit source-row outcomes for terminated and duplicate rows", () => {
  const rows = [
    { employee: "Abel Guerrero", classification: "E", standardRate: null, note: "", sourceRowNumber: 2 },
    { employee: "Santiago Moreno", classification: "E", standardRate: 20, note: "", sourceRowNumber: 76 },
    { employee: "Santiago Moreno", classification: "C", standardRate: 20, note: "Terminated", sourceRowNumber: 77 },
    { employee: "Rogelio Cervantes", classification: "C", standardRate: 23, note: "", sourceRowNumber: 72 },
    { employee: "Rogelio Cervantes", classification: "E", standardRate: 23, note: "", sourceRowNumber: 84 },
  ];
  const records = buildPayrollRateAuthorityRecords(rows, source, new Map());
  const outcomes = classifyPayrollRateRows(rows, records);

  assert.deepEqual(outcomes.map((row) => [row.sourceRowNumber, row.outcome]), [
    [2, "invalid_rate"],
    [76, "imported"],
    [77, "terminated"],
    [72, "duplicate_superseded"],
    [84, "imported"],
  ]);
});
