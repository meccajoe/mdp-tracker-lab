import assert from "node:assert/strict";
import test from "node:test";

import { canSeeTeamBonuses } from "./bonus-access";

test("canSeeTeamBonuses is admin-only", () => {
  assert.equal(canSeeTeamBonuses("admin"), true);
  assert.equal(canSeeTeamBonuses("pm"), false);
  assert.equal(canSeeTeamBonuses("production"), false);
  assert.equal(canSeeTeamBonuses("viewer"), false);
  assert.equal(canSeeTeamBonuses(null), false);
  assert.equal(canSeeTeamBonuses(undefined), false);
});
