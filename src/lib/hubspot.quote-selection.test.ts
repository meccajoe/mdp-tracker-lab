import assert from "node:assert/strict";
import test from "node:test";

import { getDeal, selectDealQuote } from "./hubspot";

test("quote selection uses an explicit associated quote override for a split-scope project", () => {
  const selected = selectDealQuote([
    { id: "production", title: "Neenah Foundry - Tradeshow Booth Production Only-V2", createdAt: "2026-02-18", amount: 200000 },
    { id: "install", title: "Neenah Foundry - Tradeshow Booth (v2)", createdAt: "2026-05-22", amount: 39610.84 },
  ], "Neenah Foundry - Tradeshow Booth", "production");

  assert.equal(selected?.id, "production");
});

test("quote selection recognizes abbreviated associated quote titles with generic version labels", () => {
  const selected = selectDealQuote([
    { id: "v1", title: "LIFEWTR", createdAt: "2026-07-16T20:13:55.291Z", amount: 65450 },
    { id: "v2", title: "LIFEWTR (v2)", createdAt: "2026-07-16T20:35:09.377Z", amount: 54100 },
    { id: "v2-copy", title: "LIFEWTR (v2) (copy)", createdAt: "2026-07-22T01:26:07.515Z", amount: 58850 },
    { id: "v3", title: "LIFEWTR (v3)", createdAt: "2026-07-21T01:28:14.115Z", amount: 83435 },
  ], "LIFEWTR Tunnel");

  assert.equal(selected?.id, "v3");
});

test("HubSpot reads retry a rate-limited request before failing", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
    }
    return new Response(JSON.stringify({
      id: "deal-1",
      properties: {
        dealname: "Retry fixture",
        closedate: "2026-07-01T00:00:00.000Z",
        due_date: "2026-08-01T00:00:00.000Z",
        amount: "100",
        hs_object_id: "deal-1",
        job_number: "26199",
        hs_is_closed_won: "true",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const deal = await getDeal("deal-1");
    assert.equal(deal.id, "deal-1");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
