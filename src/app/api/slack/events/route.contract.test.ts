import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Slack events route handles app mentions from channels, supports thread binding, and replies in-thread", () => {
  const routePath = join(process.cwd(), "src/app/api/slack/events/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /url_verification/, "route should handle Slack URL verification");
  assert.match(source, /app_mention/, "route should handle Slack app mentions");
  assert.match(source, /stripSlackBotMention\(/, "route should strip the bot mention before parsing");
  assert.match(source, /findSlackThreadBinding\(/, "route should resolve project bindings inside ongoing threads");
  assert.match(source, /upsertSlackThreadBinding\(/, "route should persist explicit project bindings");
  assert.match(source, /listSlackDmSubscriptionsForProject\(/, "route should support listing subscriptions in-thread");
  assert.match(source, /updateSlackDmSubscriptionStatus\(/, "route should support pause\/resume\/delete follow-ups");
  assert.match(source, /sendSlackChannelMessage\(/, "route should send replies back into Slack threads\/channels");
  assert.match(source, /fetchProjectCopilotContext\(/, "route should load project context before replying");
});
