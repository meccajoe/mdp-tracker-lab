import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const source = readFileSync(join(process.cwd(), "src/components/ada-quote-canvas.tsx"), "utf8");
test("Ada quote canvas downloads its selected revision as XLSX", () => {
  assert.match(source, /Download XLSX/);
  assert.match(source, /\/xlsx/);
  assert.match(source, /quoteRevision\.id/);
  assert.match(source, /workspaceId/);
});
