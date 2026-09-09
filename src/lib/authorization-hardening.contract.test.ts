import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("Ada authorization query failures use a stable generic response", () => {
  const source = readFileSync(join(root, "src/lib/ada-server.ts"), "utf8");
  assert.match(source, /const AUTHORIZATION_QUERY_ERROR = ["']Unable to verify Ada workspace access\.["']/);
  for (const result of ["roleResult", "membershipResult", "workspaceResult", "capabilityResult"]) {
    assert.match(source, new RegExp(`${result}\\.error[\\s\\S]{0,240}AUTHORIZATION_QUERY_ERROR`));
  }
  assert.doesNotMatch(source, /NextResponse\.json\(\{ error: (?:roleResult|membershipResult|workspaceResult|capabilityResult)\.error\.message \}/);
});
