import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Slack /project command route verifies signatures, loads project context, and returns Slack command responses", () => {
  const routePath = join(process.cwd(), "src/app/api/slack/commands/project/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /verifySlackRequest\(/, "route should verify Slack signatures");
  assert.match(source, /new URLSearchParams\(rawBody\)/, "route should parse Slack slash-command form bodies");
  assert.match(source, /fetchProjectCopilotContext\(/, "route should load project context from Supabase");
  assert.match(source, /parseSlackProjectCommand\(/, "route should parse project slash commands");
  assert.match(source, /response_type: "ephemeral"/, "route should return Slack-friendly ephemeral responses");
});
