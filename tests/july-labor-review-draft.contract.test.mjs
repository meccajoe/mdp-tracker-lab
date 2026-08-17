import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("July review builder is shared by the preview and persisted-draft routes", () => {
  const helper = resolve("src/lib/july-labor-review.ts");
  const draftRoute = resolve("src/app/api/admin/labor-reconciliation/july-preview/draft/route.ts");
  assert.ok(existsSync(helper));
  assert.ok(existsSync(draftRoute));
  assert.match(readFileSync(helper, "utf8"), /export async function buildJulyLaborReview/);
  assert.match(readFileSync(draftRoute, "utf8"), /buildJulyLaborReview/);
  assert.match(readFileSync(draftRoute, "utf8"), /labor_allocation_je_reviews/);
  assert.match(readFileSync(resolve("src/app/admin/labor-reconciliation/page.tsx"), "utf8"), /Save review-only draft/);
});
