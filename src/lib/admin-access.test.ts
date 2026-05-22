import assert from "node:assert/strict";
import test from "node:test";

import { canManageProjectActions } from "./admin-access.ts";

test("canManageProjectActions only allows admins", () => {
  assert.equal(canManageProjectActions("admin"), true);
  assert.equal(canManageProjectActions("pm"), false);
  assert.equal(canManageProjectActions("production"), false);
  assert.equal(canManageProjectActions("viewer"), false);
  assert.equal(canManageProjectActions(null), false);
  assert.equal(canManageProjectActions(undefined), false);
});
