import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("line item search route restores HubSpot deal fallback for rows missing quote_line_items.hubspot_deal_id", () => {
  const routePath = join(process.cwd(), "src/app/api/line-items/search/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /missingDealIds|missingHubspotDealIds/, "route should identify rows missing hubspot_deal_id");
  assert.match(source, /from\("projects"\)/, "route should query projects for fallback deal ids");
  assert.match(source, /job_number/, "route should be able to match fallback rows by job number/source_ref");
  assert.match(source, /project_id/, "route should be able to match fallback rows by project id when available");
  assert.match(source, /hubspot_deal_id\s*=\s*dealId/, "route should hydrate the returned line item with the fallback hubspot_deal_id");
});
