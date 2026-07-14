import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("admin portfolios page is a dedicated surface linked from the sidebar", () => {
  const pagePath = join(process.cwd(), "src/app/admin/portfolios/page.tsx");
  const sidebarPath = join(process.cwd(), "src/components/Sidebar.tsx");

  assert.equal(existsSync(pagePath), true, "dedicated admin portfolios page should exist");

  const pageSource = readFileSync(pagePath, "utf8");
  const sidebarSource = readFileSync(sidebarPath, "utf8");

  assert.match(pageSource, /ProjectPortfolioManager/, "page should render the portfolio manager surface");
  assert.match(pageSource, /Portfolio Center|Portfolio digests and alerts/i, "page should present a dedicated portfolio management heading");
  assert.match(pageSource, /Admin access required|roleData\?\.role === \"admin\"/, "page should stay admin-only");
  assert.match(pageSource, /Portfolio Center/, "page should remain the home for automation-rule configuration as well as subscriptions");

  assert.match(sidebarSource, /href=\"\/admin\/portfolios\"|href="\/admin\/portfolios"/, "sidebar should link to the dedicated portfolios page");
  assert.match(sidebarSource, /Portfolio Center|Portfolios/, "sidebar should label the dedicated portfolio surface clearly");
});
