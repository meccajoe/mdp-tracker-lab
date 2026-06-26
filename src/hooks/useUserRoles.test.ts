import assert from "node:assert/strict";
import test from "node:test";

import { getBonusPMs } from "./useUserRoles.ts";

test("getBonusPMs returns only users classified as PMs in tracker", () => {
  const result = getBonusPMs([
    { email: "pm@example.com", bill_spend_email: null, role: "pm", pm_initials: "DG", full_name: "Destiny Gardner", show_in_filters: true },
    { email: "admin@example.com", bill_spend_email: null, role: "admin", pm_initials: "PM", full_name: "Paul Mecca", show_in_filters: false },
    { email: "prod@example.com", bill_spend_email: null, role: "production", pm_initials: "CC", full_name: "Carlos Chaidez", show_in_filters: true },
    { email: "viewer@example.com", bill_spend_email: null, role: "viewer", pm_initials: "MM", full_name: "Maria Mecca", show_in_filters: false },
  ]);

  assert.deepEqual(result, [
    { initials: "DG", fullName: "Destiny Gardner" },
  ]);
});
