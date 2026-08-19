import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdaIntelligencePlan,
  buildAdaIntelligenceQuery,
  buildAdaProjectScope,
  enforceComparableGate,
  sanitizeAdaSearchTerm,
  buildAdaLaborSummaryEvidence,
} from "./planner";
import type { AdaEvidence } from "./types";

test("Ada strips PostgREST control punctuation and bounds search text", () => {
  assert.equal(sanitizeAdaSearchTerm("  SEG),project_type.ilike.%museum%  "), "SEG project type ilike museum");
  assert.equal(sanitizeAdaSearchTerm("a".repeat(200)).length, 80);
});

test("Ada plans only resources relevant to a material and vendor question", () => {
  const plan = buildAdaIntelligencePlan("What have we paid vendors for SEG fabric recently?");
  assert.deepEqual(plan.resources, ["materials", "quote_lines", "expenses"]);
  assert.ok(plan.terms.includes("SEG fabric"));
});

test("Ada includes labor actuals and formulas for labor questions", () => {
  const plan = buildAdaIntelligencePlan("How many install labor hours should this take?");
  assert.deepEqual(plan.resources, ["projects", "quote_lines", "labor", "formulas"]);
});

test("Ada enriches terse follow-ups with workspace identity and recent scope", () => {
  const query = buildAdaIntelligenceQuery({
    message: "What should we charge?",
    workspaceTitle: "Acme SEG back wall",
    clientName: "Acme",
    recentMessages: ["The wall is 20 feet wide and client pickup."],
  });
  assert.match(query, /What should we charge/);
  assert.match(query, /Acme SEG back wall/);
  assert.match(query, /20 feet wide/);
  assert.ok(query.length <= 600);
});

test("Ada conservatively scopes PMs to their own Tracker projects", () => {
  assert.deepEqual(buildAdaProjectScope({ role: "admin", pmInitials: "JM" }), { mode: "all" });
  assert.deepEqual(buildAdaProjectScope({ role: "pm", pmInitials: "AB" }), { mode: "pm", pmInitials: "AB" });
  assert.deepEqual(buildAdaProjectScope({ role: "viewer", pmInitials: null }), { mode: "none" });
});

test("Ada removes financial anchors when fewer than two meaningful comparables exist", () => {
  const evidence: AdaEvidence[] = [{
    resource: "projects", sourceId: "P-1", title: "One similar wall", rationale: "Project type match",
    freshness: "2026-01-01", confidence: "medium", data: { project_type: "Trade Show", contract_amount: 120000, total_spent: 80000 },
    pricingAnchor: true,
  }];
  const gated = enforceComparableGate(evidence);
  assert.equal(gated.meaningfulComparableCount, 1);
  assert.equal(gated.evidence[0].pricingAnchor, false);
  assert.deepEqual(gated.evidence[0].data, { project_type: "Trade Show" });
  assert.match(gated.limitations[0], /fewer than two/i);
});

test("Ada keeps financial anchors when two meaningful comparables exist", () => {
  const comparable = (sourceId: string): AdaEvidence => ({
    resource: "projects", sourceId, title: sourceId, rationale: "Project type match", confidence: "high",
    data: { project_type: "Trade Show", contract_amount: 100000 }, pricingAnchor: true,
  });
  const gated = enforceComparableGate([comparable("P-1"), comparable("P-2")]);
  assert.equal(gated.meaningfulComparableCount, 2);
  assert.equal(gated.evidence.every((item) => item.pricingAnchor), true);
  assert.equal(gated.limitations.length, 0);
});

test("Ada does not claim thin comparables when the question did not request projects", () => {
  const gated = enforceComparableGate([], false);
  assert.equal(gated.meaningfulComparableCount, 0);
  assert.deepEqual(gated.limitations, []);
});

test("Ada uses canonical project labor summaries instead of partial time-entry samples", () => {
  const evidence = buildAdaLaborSummaryEvidence([
    { id: "P1", name: "Trade Show Wall", qbo_total_hours: 615.25, qbo_labor_cost: 25225.25, updated_at: "2026-08-04" },
    { id: "P2", name: "Museum Case", qbo_total_hours: 40, qbo_labor_cost: 1640, updated_at: "2026-08-03" },
  ]);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].sourceId, "P1");
  assert.equal(evidence[0].data.total_hours, 615.25);
  assert.equal(evidence[0].data.total_labor_cost, 25225.25);
  assert.doesNotMatch(JSON.stringify(evidence), /employee_name/);
});
