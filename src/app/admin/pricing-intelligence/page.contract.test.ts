import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pagePath = join(process.cwd(), "src/app/admin/pricing-intelligence/page.tsx");

test("pricing data health page lets admins filter and tag indexed projects", () => {
  assert.ok(existsSync(pagePath), "pricing data health page should exist");
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /project_pricing_index/);
  assert.match(source, /project_type/);
  assert.match(source, /supabase\.from\("projects"\)\.update/);
  assert.match(source, /Missing type/);
  assert.match(source, /Trade Show/);
});
