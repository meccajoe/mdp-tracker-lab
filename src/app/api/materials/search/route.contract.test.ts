import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials search route queries catalog tables with safe filters and current price context", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/search/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /from\("materials"\)/, "route should query the materials catalog");
  assert.match(source, /material_vendor_prices/, "route should load current vendor price context");
  assert.match(source, /vendors/, "route should load vendor context");
  assert.match(source, /allowedSorts/, "route should define an allowlist for sortable fields");
  assert.match(source, /searchParams\.get\("q"\)/, "route should accept a full-text search query");
  assert.match(source, /searchParams\.get\("category"\)/, "route should accept a category filter");
  assert.match(source, /searchParams\.get\("vendor_id"\)/, "route should accept a vendor filter");
  assert.match(source, /searchParams\.get\("active"\)/, "route should accept an active filter");
  assert.match(source, /search_text|textSearch/, "route should search against the catalog search text");
  assert.match(source, /is_current/, "route should prefer current vendor price rows");
});
