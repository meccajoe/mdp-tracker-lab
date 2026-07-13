import assert from "node:assert/strict";
import test from "node:test";

import { buildPortfolioDigestText, buildPortfolioThresholdAlertText } from "./project-portfolio-subscriptions.ts";

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
        budget_hrs: 10,
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
        budget_hrs: 20,
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

test("buildPortfolioThresholdAlertText summarizes matching projects", () => {
  const alert = buildPortfolioThresholdAlertText({
    scopeType: "saved_portfolio",
    scopeJson: { portfolio_name: "client-a" },
    summaryText: "Alert when any saved portfolio client-a project reaches 95% of labor budget",
    metricKey: "labor_budget_pct",
    thresholdValue: 95,
    matchingProjects: [
      {
        id: "26145",
        name: "Another Project",
        pm: "PM",
        status: "Active",
        total_budget: 1000,
        total_spent: 950,
        qbo_total_hours: 12,
        budget_hrs: 12,
        due_date: null,
        currentValue: 100,
      },
    ],
  });

  assert.match(alert.text, /Portfolio alert — saved portfolio client-a/);
  assert.match(alert.text, /Matching projects: 1/);
  assert.match(alert.text, /Another Project: labor budget 100%/);
  assert.deepEqual(alert.snapshot.matching_project_ids, ["26145"]);
});
