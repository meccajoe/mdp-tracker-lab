import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pnlRoutePath = path.join(repoRoot, "src", "app", "api", "qbo", "project-pnl", "route.ts");
const lookupRoutePath = path.join(repoRoot, "src", "app", "api", "projects", "lookup", "route.ts");
const syncUrlsRoutePath = path.join(repoRoot, "src", "app", "api", "qbo", "sync-project-urls", "route.ts");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("QBO project P&L route uses ProjectProfitabilitySummary instead of the broken project-filtered ProfitAndLoss report", () => {
  const source = read(pnlRoutePath);

  assert.match(source, /ProjectProfitabilitySummary/);
  assert.match(source, /date_macro=All|date_macro=all/);
  assert.doesNotMatch(source, /ProfitAndLoss\?project=\$\{qboProjectId\}/);
  assert.doesNotMatch(source, /ProfitAndLoss\?customer=\$\{qboProjectId\}/);
});

test("QBO project lookup uses true project-management search instead of only Customer Job lookup", () => {
  const source = read(lookupRoutePath);

  assert.match(source, /projectManagementProjects/);
  assert.match(source, /buildQboProjectDetailsUrl|projectdetails\?id=/);
  assert.doesNotMatch(source, /SELECT Id, DisplayName FROM Customer WHERE Job = true/);
  assert.doesNotMatch(source, /customerdetail\?nameId=/);
});

test("QBO bulk project URL sync uses true project-management search and canonical projectdetails URLs", () => {
  const source = read(syncUrlsRoutePath);

  assert.match(source, /projectManagementProjects/);
  assert.match(source, /buildQboProjectDetailsUrl|projectdetails\?id=/);
  assert.doesNotMatch(source, /SELECT Id, DisplayName FROM Customer WHERE Job = true/);
  assert.doesNotMatch(source, /customerdetail\?nameId=/);
});
