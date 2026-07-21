import assert from "node:assert/strict";
import test from "node:test";

import { canManageIssues } from "./issue-access";

test("production issue management admits admin, PM, and production roles only", () => {
  assert.equal(canManageIssues("admin"), true);
  assert.equal(canManageIssues("pm"), true);
  assert.equal(canManageIssues("production"), true);
  assert.equal(canManageIssues("viewer"), false);
  assert.equal(canManageIssues(null), false);
});
