import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pnlRoutePath = path.join(repoRoot, "src", "app", "api", "qbo", "project-pnl", "route.ts");
const lookupRoutePath = path.join(repoRoot, "src", "app", "api", "projects", "lookup", "route.ts");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("QBO project P&L route uses the QBO project filter instead of the legacy customer filter", () => {
  const source = read(pnlRoutePath);

  assert.match(source, /ProfitAndLoss\?project=\$\{qboProjectId\}/);
  assert.doesNotMatch(source, /ProfitAndLoss\?customer=\$\{qboProjectId\}/);
});

test("QBO project lookup uses true project-management search instead of only Customer Job lookup", () => {
  const source = read(lookupRoutePath);

  assert.match(source, /projectManagementProjects/);
  assert.match(source, /buildQboProjectDetailsUrl|projectdetails\?id=/);
  assert.doesNotMatch(source, /SELECT Id, DisplayName FROM Customer WHERE Job = true/);
  assert.doesNotMatch(source, /customerdetail\?nameId=/);
});
