import assert from "node:assert/strict";
import test from "node:test";

test("getBonusPMs returns only users classified as PMs in tracker", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const { getBonusPMs } = await import("./useUserRoles.ts");
  const result = getBonusPMs([
    { email: "pm@example.com", bill_spend_email: null, role: "pm", pm_initials: "DG", full_name: "Destiny Gardner", show_in_filters: true, ada_access: false },
    { email: "admin@example.com", bill_spend_email: null, role: "admin", pm_initials: "PM", full_name: "Paul Mecca", show_in_filters: false, ada_access: true },
    { email: "prod@example.com", bill_spend_email: null, role: "production", pm_initials: "CC", full_name: "Carlos Chaidez", show_in_filters: true, ada_access: false },
    { email: "viewer@example.com", bill_spend_email: null, role: "viewer", pm_initials: "MM", full_name: "Maria Mecca", show_in_filters: false, ada_access: false },
  ]);

  assert.deepEqual(result, [
    { initials: "DG", fullName: "Destiny Gardner" },
  ]);
});
