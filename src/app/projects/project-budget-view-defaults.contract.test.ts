import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8");

test("project budget defaults prioritize quote-line allocation", () => {
  assert.match(source, /const \[showBudgetBreakdown, setShowBudgetBreakdown\] = useState\(false\)/);
  assert.match(source, /const \[showQuoteAllocation, setShowQuoteAllocation\] = useState\(true\)/);
  assert.match(source, /showBudgetBreakdown \? "Hide Breakdown" : "Show Breakdown"/);
  assert.match(source, /\{showBudgetBreakdown && \(/);
});
