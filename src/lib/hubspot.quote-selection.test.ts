import assert from "node:assert/strict";
import test from "node:test";

import { selectDealQuote } from "./hubspot";

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
