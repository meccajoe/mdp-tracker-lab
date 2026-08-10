import assert from "node:assert/strict";
import test from "node:test";

const preview = await import(`../src/lib/labor-allocation-preview.ts?test=${Date.now()}`);

test("groups positive-rate labor by project and source service item for review", () => {
  const result = preview.buildLaborAllocationPreview({
    entries: [
      { projectId: "26153", projectName: "Whatnot Shelves", serviceItem: "SHOP LABOR", hours: 4, hourlyRate: 25 },
      { projectId: "26153", projectName: "Whatnot Shelves", serviceItem: "SHOP LABOR", hours: 2, hourlyRate: 25 },
      { projectId: "26144", projectName: "Netflix", serviceItem: "INSTALL LABOR", hours: 3, hourlyRate: 30 },
      { projectId: "26144", projectName: "Netflix", serviceItem: "INSTALL LABOR", hours: 2, hourlyRate: 0 },
    ],
    mappings: [{ serviceItem: "SHOP LABOR", laborBucket: "Production Labor", sourceGlAccountId: "500100", targetGlAccountId: "500100" }],
  });

  assert.deepEqual(result.rows, [
    {
      projectId: "26144",
      projectName: "Netflix",
      serviceItem: "INSTALL LABOR",
      laborBucket: null,
      sourceGlAccountId: null,
      targetGlAccountId: null,
      hours: 3,
      wageCost: 90,
      status: "unmapped",
    },
    {
      projectId: "26153",
      projectName: "Whatnot Shelves",
      serviceItem: "SHOP LABOR",
      laborBucket: "Production Labor",
      sourceGlAccountId: "500100",
      targetGlAccountId: "500100",
      hours: 6,
      wageCost: 150,
      status: "mapped",
    },
  ]);
  assert.deepEqual(result.totals, { hours: 9, wageCost: 240, mappedWageCost: 150, unmappedWageCost: 90 });
});
