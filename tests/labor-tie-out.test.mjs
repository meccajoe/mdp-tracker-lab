import assert from "node:assert/strict";
import test from "node:test";

const tieOut = await import(`../src/lib/labor-tie-out.ts?test=${Date.now()}`);

test("accounts for every source row with an included or explicit exception outcome", () => {
  const result = tieOut.buildLaborTieOut([
    { id: "ok", projectId: "p1", serviceItem: "SHOP LABOR", employeeName: "Ada", hours: 8, hourlyRate: 25 },
    { id: "rate", projectId: "p1", serviceItem: "SHOP LABOR", employeeName: "Ada", hours: 2, hourlyRate: 0 },
    { id: "item", projectId: "p1", serviceItem: null, employeeName: "Ada", hours: 2, hourlyRate: 25 },
    { id: "worker", projectId: "p1", serviceItem: "SHOP LABOR", employeeName: "Unknown", hours: 2, hourlyRate: 25 },
    { id: "project", projectId: null, serviceItem: "SHOP LABOR", employeeName: "Ada", hours: 2, hourlyRate: 25 },
  ], new Map([["ada", "employee"]]), new Set(["SHOP LABOR"]));
  assert.deepEqual(result.summary, { sourceRows: 5, includedRows: 1, exceptionRows: 4, sourceHours: 16, includedHours: 8, exceptionHours: 8, sourceWageCost: 350, includedWageCost: 200, exceptionWageCost: 150, balancedPopulation: true, balancedWageCost: true });
  assert.deepEqual(result.exceptions.map((row) => [row.id, row.reason]), [["rate", "invalid_rate"], ["item", "missing_service_item"], ["worker", "unclassified_worker"], ["project", "missing_project"]]);
});
