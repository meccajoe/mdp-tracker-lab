import assert from "node:assert/strict";
import test from "node:test";

import { resolveEffectiveAdminView } from "./admin-view.ts";

test("resolveEffectiveAdminView hides admin-only UI when previewing non-admin mode", () => {
  assert.equal(resolveEffectiveAdminView(true, false), true);
  assert.equal(resolveEffectiveAdminView(true, true), false);
  assert.equal(resolveEffectiveAdminView(false, false), false);
  assert.equal(resolveEffectiveAdminView(false, true), false);
});
