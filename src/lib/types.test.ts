import assert from "node:assert/strict";
import test from "node:test";

import { PM_NAMES, getPMName } from "./types.ts";

test("DG is recognized as Destiny Gardner in PM name helpers", () => {
  assert.equal(PM_NAMES.DG, "Destiny Gardner");
  assert.equal(getPMName("DG"), "Destiny Gardner");
});
