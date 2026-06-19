import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("hubspot quote cron route refreshes HubSpot-linked projects from the latest quote", () => {
  const routePath = join(process.cwd(), "src/app/api/cron/sync-hubspot-quotes/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /authorization\"\)\?\.replace\("Bearer ", ""\)/, "cron route should require bearer authorization");
  assert.match(source, /process\.env\.CRON_SECRET/, "cron route should validate CRON_SECRET");
  assert.match(source, /from\("projects"\)/, "cron route should read projects from Supabase");
  assert.match(source, /not\("hubspot_deal_id",\s*"is",\s*null\)/, "cron route should only scan HubSpot-linked projects");
  assert.match(source, /getDealQuote\(/, "cron route should fetch the latest deal quote");
  assert.match(source, /getQuoteLineItems\(/, "cron route should fetch quote line items");
  assert.match(source, /parseLineItems\(/, "cron route should parse the latest quote line items");
  assert.match(source, /buildHubspotQuoteSyncFields\(/, "cron route should rebuild quote-derived budget fields");
  assert.match(source, /status:\s*"skipped"[\s\S]*missing_quote|missing_quote[\s\S]*status:\s*"skipped"/, "cron route should skip projects that do not have a usable latest quote");
  assert.match(source, /contract_amount:\s*parsed\.contractAmount\s*\|\|\s*null/, "cron route should refresh contract_amount from the latest quote data");
  assert.match(source, /update\(updatePayload\)[\s\S]*?eq\("id",\s*project\.id\)/, "cron route should write refreshed quote fields back to the project row");
});
