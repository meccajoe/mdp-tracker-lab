import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pagePath = join(process.cwd(), "src/app/admin/issues/page.tsx");

test("central issue report supports requested filters and record management", () => {
  assert.ok(existsSync(pagePath), "central issue report should exist");
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /production_issues/);
  assert.match(source, /dateFrom/);
  assert.match(source, /dateTo/);
  assert.match(source, /projectId/);
  assert.match(source, /category/);
  assert.match(source, /severity/);
  assert.match(source, /IssueEditDialog/);
});
