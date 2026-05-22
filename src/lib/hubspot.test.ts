import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHubspotDate } from "./hubspot.ts";

test("normalizeHubspotDate preserves YYYY-MM-DD values and trims ISO timestamps", () => {
  assert.equal(normalizeHubspotDate("2026-06-12"), "2026-06-12");
  assert.equal(normalizeHubspotDate("2026-05-17T16:39:28.710Z"), "2026-05-17");
  assert.equal(normalizeHubspotDate(null), null);
  assert.equal(normalizeHubspotDate(undefined), null);
  assert.equal(normalizeHubspotDate(""), null);
});
