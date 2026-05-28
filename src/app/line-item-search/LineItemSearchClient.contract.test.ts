import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("expanded line item details hide Source ID, show Job #/Deal Name, and wrap long reference values safely", () => {
  const filePath = join(process.cwd(), "src/app/line-item-search/LineItemSearchClient.tsx");
  const source = readFileSync(filePath, "utf8");

  assert.doesNotMatch(source, /Source ID:/, "expanded details should not render Source ID as visible text");
  assert.match(source, /Job #\/Deal Name:/, "expanded details should label the reference field clearly");
  assert.match(source, /break-all|break-words|whitespace-normal/, "expanded details should include wrapping classes for long values");
});
