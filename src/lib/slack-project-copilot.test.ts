import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlackNotificationBlocks,
  buildSlackProjectResponse,
  parseSlackProjectCommand,
  stripSlackBotMention,
} from "./slack-project-copilot.ts";

const project = {
  id: "26144",
  name: "Nissan Texas Letters Repair",
  budget_hrs: 100,
  qbo_total_hours: 62,
  total_budget: 50000,
  total_spent: 21400,
  budget_materials: 40000,
  budget_design: null,
  budget_pm: null,
  budget_shipping: null,
  budget_id_labor: null,
  budget_travel: null,
  budget_props: null,
  budget_equipment: null,
  budget_rental: null,
  budget_crating: null,
  budget_flooring: null,
} as const;

test("parseSlackProjectCommand parses notify requests and defaults empty intent to summary", () => {
  assert.deepEqual(parseSlackProjectCommand("26144 notify labor too high"), {
    projectId: "26144",
    intent: "notify",
    requestText: "labor too high",
  });

  assert.deepEqual(parseSlackProjectCommand("26144"), {
    projectId: "26144",
    intent: "summary",
    requestText: "summary",
  });
});

test("stripSlackBotMention removes the leading app mention", () => {
  assert.equal(stripSlackBotMention("<@U123> 26144 summary"), "26144 summary");
});

test("buildSlackProjectResponse creates a create-alert button for notify recommendations", () => {
  const response = buildSlackProjectResponse({
    command: { projectId: "26144", intent: "notify", requestText: "labor too high" },
    project,
    categoryActuals: { budget_materials: 21400 },
  });

  assert.match(response.text, /delivery default: slack dm/i);
  assert.ok(response.blocks?.length);
  assert.deepEqual(response.blocks, buildSlackNotificationBlocks({
    project,
    recommendation: {
      type: "threshold",
      metricKey: "qbo_total_hours",
      scopeKey: "budget_hrs",
      unit: "hours",
      currentValue: 62,
      basisValue: 100,
      basisLabel: "Labor budget hours",
      spotlight: { id: "warning", label: "Warning", threshold: 95 },
      options: [
        { id: "heads_up", label: "Heads-up", threshold: 80 },
        { id: "warning", label: "Warning", threshold: 95 },
        { id: "over_budget", label: "Over budget", threshold: 100 },
        { id: "critical", label: "Critical overrun", threshold: 110 },
      ],
      message: "Project 26144 has a labor budget of 100 hours and is currently at 62 hours. I recommend a warning alert at 95 hours.",
    },
  }));
});
