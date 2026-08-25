import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = join(root, "supabase/migrations/20260825211500_postmortem_generation_state.sql");
const routePath = join(root, "src/app/api/projects/[id]/postmortem/generate/route.ts");
const cardPath = join(root, "src/components/project-postmortem-card.tsx");

test("post-mortem generation has durable queued, completed, and failed states", () => {
  assert.equal(existsSync(migrationPath), true, "generation-state migration must exist");
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /'generating'/);
  assert.match(migration, /'failed'/);
  assert.match(migration, /error_message/);

  const route = readFileSync(routePath, "utf8");
  assert.match(route, /status:\s*"generating"/);
  assert.match(route, /status:\s*"draft"/);
  assert.match(route, /status:\s*"failed"/);
  assert.match(route, /runId/);

  const card = readFileSync(cardPath, "utf8");
  assert.match(card, /postmortem\.status === "generating"/);
  assert.match(card, /postmortem\.status === "failed"/);
});
