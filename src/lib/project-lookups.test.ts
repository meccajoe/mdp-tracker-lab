import assert from "node:assert/strict";
import test from "node:test";

import { getLookupLinkedFields } from "./project-lookups.ts";

test("getLookupLinkedFields includes both HubSpot and QBO fields from a lookup result", () => {
  const linked = getLookupLinkedFields({
    job_number: "26115",
    hubspot_deal_id: "324817776318",
    hubspot_deal_url: "https://hubspot.example/deal/324817776318",
    hubspot_deal_name: "Netflix - Wall of Fame",
    qbo_project_id: "98765",
    qbo_project_url: "https://qbo.example/customer/98765",
    qbo_project_name: "26115 - Netflix - Wall of Fame",
  });

  assert.deepEqual(linked, {
    hubspotDealId: "324817776318",
    hubspotDealUrl: "https://hubspot.example/deal/324817776318",
    qboProjectId: "98765",
    qboProjectUrl: "https://qbo.example/customer/98765",
  });
});
