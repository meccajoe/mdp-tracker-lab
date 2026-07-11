import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Slack /project command route verifies signatures, supports thread binding, and manages subscriptions", () => {
  const routePath = join(process.cwd(), "src/app/api/slack/commands/project/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /verifySlackRequest\(/, "route should verify Slack signatures");
  assert.match(source, /new URLSearchParams\(rawBody\)/, "route should parse Slack slash-command form bodies");
  assert.match(source, /fetchProjectCopilotContext\(/, "route should load project context from Supabase");
  assert.match(source, /parseSlackProjectCommand\(/, "route should parse project slash commands");
  assert.match(source, /parseSlackPortfolioCommand\(/, "route should parse portfolio slash commands");
  assert.match(source, /buildSubscriptionCreatePayload\(/, "route should be able to create portfolio digest subscriptions");
  assert.match(source, /findSlackThreadBinding\(/, "route should resolve thread-bound projects when a job number is omitted");
  assert.match(source, /upsertSlackThreadBinding\(/, "route should persist explicit project bindings for future follow-ups");
  assert.match(source, /listSlackDmSubscriptionsForProject\(/, "route should list Slack DM subscriptions");
  assert.match(source, /listSlackDmSubscriptions\(/, "route should list portfolio subscriptions");
  assert.match(source, /updateSlackDmSubscriptionStatus\(/, "route should support pause\/resume\/delete commands");
  assert.match(source, /response_type: "ephemeral"/, "route should return Slack-friendly ephemeral responses");
});
