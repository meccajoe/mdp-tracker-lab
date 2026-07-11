import assert from "node:assert/strict";
import test from "node:test";

import { buildPortfolioDigestText } from "./project-portfolio-subscriptions.ts";

test("buildPortfolioDigestText summarizes active projects and changes", () => {
  const digest = buildPortfolioDigestText({
    scopeType: "pm_active_projects",
    scopeJson: { pm_initials: "PM" },
    summaryText: "Weekday 4pm portfolio digest — PM active projects",
    projects: [
      {
        id: "26144",
        name: "Netflix - Bridgerton Vitrine Deinstallation",
        pm: "PM",
        status: "Active",
        total_budget: 735,
        total_spent: 610,
        qbo_total_hours: 6.35,
        due_date: null,
      },
      {
        id: "26145",
        name: "Another Project",
        pm: "PM",
        status: "Active",
        total_budget: 1000,
        total_spent: 950,
        qbo_total_hours: 12,
        due_date: null,
      },
    ],
    previousSnapshot: {
      projects: [
        { id: "26144", total_spent: 500, qbo_total_hours: 5 },
        { id: "26145", total_spent: 900, qbo_total_hours: 11 },
      ],
    },
  });

  assert.match(digest.text, /Portfolio digest — PM active projects/);
  assert.match(digest.text, /Active projects: 2/);
  assert.match(digest.text, /26145 — Another Project: 95% of budget used/);
  assert.match(digest.text, /26144 — Netflix - Bridgerton Vitrine Deinstallation: spend \+\$110/);
  assert.equal((digest.snapshot.projects as Array<{ id: string }>).length, 2);
});
