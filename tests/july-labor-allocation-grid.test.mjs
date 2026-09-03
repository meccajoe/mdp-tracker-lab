import assert from "node:assert/strict";
import test from "node:test";

const grid = await import(`../src/lib/july-labor-allocation-grid.ts?test=${Date.now()}`);

test("groups July wage allocation rows by project, service GL, and worker class", () => {
  const result = grid.buildJulyLaborAllocationGrid([
    { projectId: "26153", projectName: "Whatnot", employeeName: "Daniel Gutierrez", serviceItem: "SHOP LABOR", hours: 4, hourlyRate: 25 },
    { projectId: "26153", projectName: "Whatnot", employeeName: "Daniel Gutierrez", serviceItem: "SHOP LABOR", hours: 2, hourlyRate: 25 },
    { projectId: "26144", projectName: "Netflix", employeeName: "Alex Wall", serviceItem: "GRAPHICS LABOR", hours: 3, hourlyRate: 30 },
  ], new Map([["daniel gutierrez", "employee"], ["alex wall", "contractor"]]));

  assert.deepEqual(result.rows, [
    { projectId: "26144", projectName: "Netflix", serviceItem: "GRAPHICS LABOR", targetGlAccountId: "105", targetGlAccountDisplay: "500600 COS - Labor:COS - Graphics", workerClassification: "contractor", hours: 3, wageCost: 90 },
    { projectId: "26153", projectName: "Whatnot", serviceItem: "SHOP LABOR", targetGlAccountId: "231", targetGlAccountDisplay: "500100 COS - Labor:COS - Production Labor", workerClassification: "employee", hours: 6, wageCost: 150 },
  ]);
  assert.deepEqual(result.unclassifiedWorkers, []);
});
