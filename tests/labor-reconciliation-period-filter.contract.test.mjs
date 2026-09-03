import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/admin/labor-reconciliation/page.tsx", "utf8");
const previewRoute = readFileSync("src/app/api/admin/labor-reconciliation/july-preview/route.ts", "utf8");
const draftRoute = readFileSync("src/app/api/admin/labor-reconciliation/july-preview/draft/route.ts", "utf8");
const packageRoute = readFileSync("src/app/api/admin/labor-reconciliation/july-review-package/route.ts", "utf8");
const review = readFileSync("src/lib/july-labor-review.ts", "utf8");

test("Labor Reconciliation applies the selected period to preview, draft, and package workflows", () => {
  assert.match(page, /start.*end.*projectId/s);
  assert.match(page, /july-preview\?\$\{reviewParams\.toString\(\)\}/);
  assert.match(page, /start, end, projectId/);
  assert.match(page, /july-review-package\?\$\{reviewParams\.toString\(\)\}/);
  assert.match(previewRoute, /get\("start"\)/);
  assert.match(previewRoute, /get\("end"\)/);
  assert.match(draftRoute, /start\?: string; end\?: string/);
  assert.match(draftRoute, /period_start: review\.period\.startDate/);
  assert.match(draftRoute, /period_end: review\.period\.endDate/);
  assert.match(packageRoute, /get\("start"\)/);
  assert.match(packageRoute, /get\("end"\)/);
  assert.match(review, /gte\("date", period\.startDate\)/);
  assert.match(review, /lte\("date", period\.endDate\)/);
});
