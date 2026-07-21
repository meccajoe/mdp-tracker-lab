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
