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
    { accountId: "231", accountDisplay: "500100 COS - Labor:COS - Production Labor", projectId: "26153", projectName: "Whatnot", memo: "July 2026 wage allocation — GL 231", debit: 150, credit: 0 },
    { accountId: "105", accountDisplay: "500600 COS - Labor:COS - Graphics", projectId: "26144", projectName: "Netflix", memo: "July 2026 wage allocation — GL 105", debit: 90, credit: 0 },
    { accountId: "231", accountDisplay: "500100 COS - Labor:COS - Production Labor", projectId: null, projectName: null, memo: "July 2026 wage reclass — unprojected COGS", debit: 0, credit: 150 },
    { accountId: "105", accountDisplay: "500600 COS - Labor:COS - Graphics", projectId: null, projectName: null, memo: "July 2026 wage reclass — unprojected COGS", debit: 0, credit: 90 },
  ]);
});

test("consolidates multiple Service Items into one project and GL debit line", () => {
  const result = je.buildJulyLaborJeDraft([
    { projectId: "26153", projectName: "Whatnot", serviceItem: "SHOP LABOR", targetGlAccountId: "231", workerClassification: "employee", hours: 6, wageCost: 150 },
    { projectId: "26153", projectName: "Whatnot", serviceItem: "FAB LABOR", targetGlAccountId: "231", workerClassification: "employee", hours: 2, wageCost: 50 },
  ]);

  assert.deepEqual(result.lines, [
    { accountId: "231", accountDisplay: "500100 COS - Labor:COS - Production Labor", projectId: "26153", projectName: "Whatnot", memo: "July 2026 wage allocation — GL 231", debit: 200, credit: 0 },
    { accountId: "231", accountDisplay: "500100 COS - Labor:COS - Production Labor", projectId: null, projectName: null, memo: "July 2026 wage reclass — unprojected COGS", debit: 0, credit: 200 },
  ]);
  assert.equal(result.debitTotal, 200);
  assert.equal(result.creditTotal, 200);
  assert.equal(result.balanced, true);
});

test("reclasses only within the three approved COGS accounts", () => {
  const result = je.buildLaborJeDraft([
    { projectId: "26153", projectName: "Whatnot", serviceItem: "SHOP LABOR", targetGlAccountId: "231", workerClassification: "employee", hours: 6, wageCost: 150 },
    { projectId: "26144", projectName: "Netflix", serviceItem: "INSTALL LABOR", targetGlAccountId: "110", workerClassification: "contractor", hours: 2, wageCost: 80 },
    { projectId: "26144", projectName: "Netflix", serviceItem: "GRAPHICS LABOR", targetGlAccountId: "105", workerClassification: "contractor", hours: 1, wageCost: 25 },
  ], "August 2026");

  assert.deepEqual(result.lines.filter((line) => line.credit > 0), [
    { accountId: "231", accountDisplay: "500100 COS - Labor:COS - Production Labor", projectId: null, projectName: null, memo: "August 2026 wage reclass — unprojected COGS", debit: 0, credit: 150 },
    { accountId: "110", accountDisplay: "500110 COS - Labor:COS - Contract Labour", projectId: null, projectName: null, memo: "August 2026 wage reclass — unprojected COGS", debit: 0, credit: 80 },
    { accountId: "105", accountDisplay: "500600 COS - Labor:COS - Graphics", projectId: null, projectName: null, memo: "August 2026 wage reclass — unprojected COGS", debit: 0, credit: 25 },
  ]);
  assert.deepEqual(new Set(result.lines.map((line) => line.accountId)), new Set(["231", "110", "105"]));
  assert.equal(result.balanced, true);
});
