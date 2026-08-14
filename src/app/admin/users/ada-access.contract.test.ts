import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const users = readFileSync(join(root, "src/app/admin/users/page.tsx"), "utf8");
const types = readFileSync(join(root, "src/lib/types.ts"), "utf8");
test("Admins can toggle Ada access in Users", () => {
  assert.match(types, /ada_access: boolean/);
  assert.match(users, /handleToggleAdaAccess/);
  assert.match(users, /ada_access/);
  assert.match(users, /Ada Access/);
  assert.match(users, /Enable Ada access|Disable Ada access/);
});
