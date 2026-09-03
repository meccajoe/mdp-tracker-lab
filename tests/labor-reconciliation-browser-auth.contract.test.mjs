import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/admin/labor-reconciliation/page.tsx", "utf8");
const auth = readFileSync("src/lib/project-portfolio-server.ts", "utf8");
const routes = ["src/app/api/admin/labor-reconciliation/route.ts", "src/app/api/admin/labor-reconciliation/july-preview/route.ts", "src/app/api/admin/labor-reconciliation/july-preview/draft/route.ts", "src/app/api/admin/labor-reconciliation/july-review-package/route.ts"].map((path) => readFileSync(path, "utf8"));

test("Labor Reconciliation sends browser bearer auth to every protected API call", () => {
  assert.match(page, /session\.access_token/);
  assert.match(page, /Authorization: .*session\.access_token/);
});
test("project admin guard accepts and validates bearer auth", () => {
  assert.match(auth, /request\?: Request/);
  assert.match(auth, /getUser\(bearer\)/);
  for (const source of routes) assert.match(source, /requireProjectAdmin\(request\)/);
});
