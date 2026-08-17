import assert from "node:assert/strict";
import test from "node:test";

const audit = await import(`../src/lib/labor-item-gl-audit.ts?test=${Date.now()}`);

test("marks QBO Item GL mappings as matched, mismatched, or missing", () => {
  const rows = audit.auditLaborItemGl([
    { name: "SHOP LABOR", expenseAccountId: "231", expenseAccountName: "COS - Production Labor" },
    { name: "GRAPH LABOR", expenseAccountId: "999", expenseAccountName: "Wrong account" },
    { name: "INSTALL LABOR", expenseAccountId: null, expenseAccountName: null },
  ]);
  assert.deepEqual(rows.map((row) => [row.displayName, row.expectedGlAccountId, row.status]), [["GRAPHICS LABOR", "105", "mismatch"], ["INSTALL LABOR", "110", "missing_qbo_expense_gl"], ["SHOP LABOR", "231", "matched"]]);
});
