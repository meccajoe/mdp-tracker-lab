import assert from "node:assert/strict";
import test from "node:test";

import { buildSlackTestMessage } from "./slack-delivery.ts";

test("buildSlackTestMessage formats threshold subscriptions for Slack DM delivery", () => {
  const message = buildSlackTestMessage({
    projectId: "26144",
    projectName: "Nissan Texas Letters Repair",
    summaryText: "Alert when labor hours reach 95 hrs",
    recommendationMessage: "Project 26144 has a labor budget of 100 hours and is currently at 62 hours. I recommend a warning alert at 95 hours.",
  });

  assert.match(message, /Project 26144/i);
  assert.match(message, /Nissan Texas Letters Repair/);
  assert.match(message, /Alert when labor hours reach 95 hrs/);
  assert.match(message, /recommend a warning alert at 95 hours/i);
});
