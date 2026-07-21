import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("hubspot webhook line-item sync persists hubspot_deal_id on quote_line_items rows", () => {
  const routePath = join(process.cwd(), "src/app/api/webhooks/hubspot/route.ts");
  const source = readFileSync(routePath, "utf8");

  const rowsBlockMatch = source.match(/const rows = lineItems\.map\([\s\S]*?\n\s*\}\)\);/);
  assert.ok(rowsBlockMatch, "webhook route should build line item rows for upsert");

  const rowsBlock = rowsBlockMatch[0];
  assert.match(rowsBlock, /source_id:\s*quoteId/, "webhook rows should still use quote id as source_id");
  assert.match(rowsBlock, /hubspot_deal_id:\s*String\(dealId\)|hubspot_deal_id:\s*dealId/, "webhook upsert rows should persist the HubSpot deal id");
  assert.match(source, /upsert\(rows,\s*\{ onConflict: "source,source_id,line_key" \}\)/, "webhook route should still upsert line items on the existing conflict key");
});

test("hubspot project-create notifications can use Ada's dedicated delivery token", () => {
  const routePath = join(process.cwd(), "src/app/api/webhooks/hubspot/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /PROJECT_NOTIFICATION_SLACK_BOT_TOKEN/);
  assert.match(source, /Bearer.*PROJECT_NOTIFICATION_SLACK_BOT_TOKEN/);
});
