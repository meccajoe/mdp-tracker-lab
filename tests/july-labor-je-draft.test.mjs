import assert from "node:assert/strict";
import test from "node:test";

const je = await import(`../src/lib/july-labor-je-draft.ts?test=${Date.now()}`);

test("builds a balanced review-only July wage JE", () => {
  const result = je.buildJulyLaborJeDraft([
    { projectId: "26153", projectName: "Whatnot", serviceItem: "SHOP LABOR", targetGlAccountId: "231", workerClassification: "employee", hours: 6, wageCost: 150 },
    { projectId: "26144", projectName: "Netflix", serviceItem: "GRAPHICS LABOR", targetGlAccountId: "105", workerClassification: "contractor", hours: 3, wageCost: 90 },
  ]);
  assert.equal(result.debitTotal, 240);
  assert.equal(result.creditTotal, 240);
  assert.equal(result.balanced, true);
  assert.deepEqual(result.lines, [
    { accountId: "231", projectId: "26153", projectName: "Whatnot", memo: "July 2026 wage allocation — SHOP LABOR", debit: 150, credit: 0 },
    { accountId: "105", projectId: "26144", projectName: "Netflix", memo: "July 2026 wage allocation — GRAPHICS LABOR", debit: 90, credit: 0 },
    { accountId: "427", projectId: null, projectName: null, memo: "July 2026 employee wage allocation", debit: 0, credit: 150 },
    { accountId: "392", projectId: null, projectName: null, memo: "July 2026 contractor wage allocation", debit: 0, credit: 90 },
  ]);
});
