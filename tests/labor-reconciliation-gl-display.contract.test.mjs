import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/admin/labor-reconciliation/page.tsx", "utf8");

test("JE review CSV retains QBO account IDs and adds readable GL account labels", () => {
  assert.match(page, /Account ID,GL Account,Project ID,Project,Memo,Debit,Credit/);
  assert.match(page, /line\.accountId, line\.accountDisplay, line\.projectId/);
});