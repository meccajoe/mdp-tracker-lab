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
    { accountId: "427", accountDisplay: "600100 Payroll Expenses:Salaries & wages", projectId: null, projectName: null, memo: "July 2026 employee wage allocation", debit: 0, credit: 150 },
    { accountId: "392", accountDisplay: "600150 Payroll Expenses:Salaries & wages:Contract Labor", projectId: null, projectName: null, memo: "July 2026 contractor wage allocation", debit: 0, credit: 90 },
  ]);
});

test("consolidates multiple Service Items into one project and GL debit line", () => {
  const result = je.buildJulyLaborJeDraft([
    { projectId: "26153", projectName: "Whatnot", serviceItem: "SHOP LABOR", targetGlAccountId: "231", workerClassification: "employee", hours: 6, wageCost: 150 },
    { projectId: "26153", projectName: "Whatnot", serviceItem: "FAB LABOR", targetGlAccountId: "231", workerClassification: "employee", hours: 2, wageCost: 50 },
  ]);

  assert.deepEqual(result.lines, [
    { accountId: "231", accountDisplay: "500100 COS - Labor:COS - Production Labor", projectId: "26153", projectName: "Whatnot", memo: "July 2026 wage allocation — GL 231", debit: 200, credit: 0 },
    { accountId: "427", accountDisplay: "600100 Payroll Expenses:Salaries & wages", projectId: null, projectName: null, memo: "July 2026 employee wage allocation", debit: 0, credit: 200 },
  ]);
  assert.equal(result.debitTotal, 200);
  assert.equal(result.creditTotal, 200);
  assert.equal(result.balanced, true);
});
