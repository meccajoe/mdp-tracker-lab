import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("storage is modeled as its own non-L&M budget category across schema and app configs", () => {
  const budgetFormula = readFileSync(join(process.cwd(), "src/lib/budget-formula.ts"), "utf8");
  const constants = readFileSync(join(process.cwd(), "src/lib/constants.ts"), "utf8");
  const types = readFileSync(join(process.cwd(), "src/lib/types.ts"), "utf8");
  const parser = readFileSync(join(process.cwd(), "src/lib/hubspot-quote-parser.ts"), "utf8");
  const rebaseline = readFileSync(join(process.cwd(), "src/lib/project-rebaseline.ts"), "utf8");
  const wipBreakdown = readFileSync(join(process.cwd(), "src/lib/wip-budget-breakdown.ts"), "utf8");
  const recommendationConfig = readFileSync(join(process.cwd(), "src/lib/project-notification-recommendations.ts"), "utf8");

  assert.match(types, /budget_storage/, "types should expose budget_storage");
  assert.match(types, /quote_storage/, "types should expose quote_storage");
  assert.match(types, /pct_storage/, "types should expose pct_storage");

  assert.match(budgetFormula, /key:\s*"storage"/, "budget formula should include storage as a configurable non-L&M category");
  assert.match(constants, /budget_storage/, "budget field list should include budget_storage");
  assert.match(parser, /storage/, "quote parser should classify storage into its own category");
  assert.match(rebaseline, /quote_storage|budget_storage|pct_storage/, "rebaseline helpers should carry storage quote and budget fields");
  assert.match(wipBreakdown, /Storage/, "WIP budget breakdown should include storage");
  assert.match(recommendationConfig, /budget_storage/, "notification category config should understand storage as its own budget category");
});
