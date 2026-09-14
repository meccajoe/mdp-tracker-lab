import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isQuoteProductAllowedEmail } from "@/lib/quote-product-access";

const root = process.cwd();
const source = (relativePath: string) => {
  const path = join(root, relativePath);
  assert.ok(existsSync(path), `${relativePath} should exist`);
  return readFileSync(path, "utf8");
};

test("unfinished Quote Workspace product is visible only to Joe", () => {
  assert.equal(isQuoteProductAllowedEmail("joe@meccadesign.com"), true);
  assert.equal(isQuoteProductAllowedEmail(" MECCA.JOE@GMAIL.COM "), true);
  assert.equal(isQuoteProductAllowedEmail("paul@meccadesign.com"), false);
  assert.equal(isQuoteProductAllowedEmail("alina@meccadesign.com"), false);
  assert.equal(isQuoteProductAllowedEmail(null), false);

  const server = source("src/lib/ada-server.ts");
  const accessRoute = source("src/app/api/quotes/access/route.ts");
  const libraryPage = source("src/app/quotes/page.tsx");
  const workspacePage = source("src/app/quotes/[workspaceId]/page.tsx");
  assert.match(server, /requireQuoteProductAccess/);
  assert.match(server, /requireQuoteProductWorkspaceAccess/);
  assert.match(accessRoute, /requireQuoteProductAccess/);
  assert.match(libraryPage, /requireQuoteProductAccess/);
  assert.match(workspacePage, /requireQuoteProductAccess/);

  for (const route of [
    "src/app/api/quote-workspaces/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/restore/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/proposals/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/proposals/[proposalId]/accept/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/proposals/[proposalId]/reject/route.ts",
  ]) assert.match(source(route), /requireQuoteProductAccess|requireQuoteProductWorkspaceAccess/, `${route} must enforce preview access`);
});

test("review API reads exact normalized current-revision records without mutations", () => {
  const route = source("src/app/api/quote-workspaces/[workspaceId]/review/route.ts");
  assert.match(route, /requireQuoteProductWorkspaceAccess\(workspaceId\)/);
  assert.match(route, /current_revision_id/);
  for (const table of [
    "ada_quote_revisions",
    "quote_revision_lines",
    "quote_revision_work_packages",
    "quote_revision_line_work_packages",
    "quote_revision_work_package_labor",
    "work_packages",
    "work_types",
    "quote_workflow_events",
  ]) assert.match(route, new RegExp(`from\\(\"${table}\"\\)`));
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(route, /normalization_exception/);
  assert.match(route, /formula_status/);
  assert.match(route, /production_mapping_status/);
  assert.match(route, /allocation_status/);
});

test("quote workspace exposes a dense read-only operational Review tab", () => {
  const workspace = source("src/components/quote-workspace.tsx");
  const review = source("src/components/quote-review-workspace.tsx");
  assert.match(workspace, /Workspace/);
  assert.match(workspace, /Review/);
  assert.match(workspace, /QuoteReviewWorkspace/);
  assert.match(review, /\/api\/quote-workspaces\/\$\{workspaceId\}\/review/);
  assert.match(review, /data-slot="quote-review-workspace"/);
  for (const label of ["Commercial lines", "Build Items", "Labor allocation", "Revision history", "Exceptions", "Approval state"]) {
    assert.match(review, new RegExp(label));
  }
  assert.match(review, /Hours allowed/);
  assert.match(review, /overflow-x-auto/);
  assert.match(review, /Read-only review/);
  assert.doesNotMatch(review, /Approve|Publish|Provision|Release project/);
});
