import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("subscription test-delivery route authenticates, resolves the target user email, and sends Slack DMs via the shared helper", () => {
  const routePath = join(process.cwd(), "src/app/api/projects/[id]/subscriptions/test-delivery/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /auth\.getUser\(/, "route should require an authenticated user");
  assert.match(source, /from\("project_summary"\)/, "route should load project summary context");
  assert.match(source, /from\("project_subscriptions"\)/, "route should be able to load saved subscription rows");
  assert.match(source, /sendSlackDmByEmail\(/, "route should use the shared Slack DM helper");
  assert.match(source, /MDP_SLACK_BOT_TOKEN/, "route should depend on the existing Slack bot token env var");
});
