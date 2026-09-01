import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeHubspotDate,
  resolveHubSpotProjectManagerInitials,
  sortHubspotLineItemsByQuotePosition,
} from "./hubspot.ts";

test("normalizeHubspotDate preserves YYYY-MM-DD values and trims ISO timestamps", () => {
  assert.equal(normalizeHubspotDate("2026-06-12"), "2026-06-12");
  assert.equal(normalizeHubspotDate("2026-05-17T16:39:28.710Z"), "2026-05-17");
  assert.equal(normalizeHubspotDate(null), null);
  assert.equal(normalizeHubspotDate(undefined), null);
  assert.equal(normalizeHubspotDate(""), null);
});

test("sortHubspotLineItemsByQuotePosition follows explicit quote positions first", () => {
  const sorted = sortHubspotLineItemsByQuotePosition([
    { id: "a", name: "Third", sku: "400700", amount: 100, quote_position: 3 },
    { id: "b", name: "Unpositioned", sku: "400403", amount: 200 },
    { id: "c", name: "First", sku: "400100", amount: 300, quote_position: 1 },
    { id: "d", name: "Second", sku: "409001", amount: 400, quote_position: 2 },
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ["c", "d", "a", "b"]);
});

test("resolveHubSpotProjectManagerInitials maps exact Tracker names and approved aliases", () => {
  const roles = [
    { full_name: "Nick Gonzales", pm_initials: "NG" },
    { full_name: "Destiny Gardner", pm_initials: "DG" },
    { full_name: "Molly Strader", pm_initials: "MS" },
  ];

  assert.equal(resolveHubSpotProjectManagerInitials("Nicholas Gonzales", roles), "NG");
  assert.equal(resolveHubSpotProjectManagerInitials("Destiny Freeman", roles), "DG");
  assert.equal(resolveHubSpotProjectManagerInitials("Molly Strader", roles), "MS");
});

test("resolveHubSpotProjectManagerInitials fails closed for unknown or ambiguous names", () => {
  assert.equal(
    resolveHubSpotProjectManagerInitials("Kenneth Mecca", [
      { full_name: "Kristina Morland", pm_initials: "KM" },
    ]),
    null,
  );
  assert.equal(
    resolveHubSpotProjectManagerInitials("Molly Strader", [
      { full_name: "Molly Strader", pm_initials: "MS" },
      { full_name: "Molly Strader", pm_initials: "M2" },
    ]),
    null,
  );
  assert.equal(resolveHubSpotProjectManagerInitials(null, []), null);
});
