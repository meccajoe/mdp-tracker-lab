import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = join(root, "supabase/migrations/20260820174500_ada_feedback.sql");
const route = join(root, "src/app/api/ada/feedback/route.ts");
const widget = join(root, "src/components/ada-feedback-widget.tsx");
const shell = join(root, "src/components/ada-workspace-shell.tsx");
const syncScript = join(root, "scripts/sync-ada-feedback-backlog.mjs");

test("Ada exposes a persistent authenticated feedback control on every Ada screen", () => {
  for (const path of [migration, route, widget, syncScript]) assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  const migrationSource = readFileSync(migration, "utf8");
  const routeSource = readFileSync(route, "utf8");
  const widgetSource = readFileSync(widget, "utf8");
  const shellSource = readFileSync(shell, "utf8");

  assert.match(migrationSource, /create table if not exists public\.ada_feedback/i);
  assert.match(migrationSource, /submitted_by_email text not null/i);
  assert.match(migrationSource, /workspace_id uuid references public\.ada_quote_workspaces/i);
  assert.match(migrationSource, /status text not null default 'new'/i);
  assert.match(migrationSource, /enable row level security/i);

  assert.match(routeSource, /requireAdaAccess\(\)/);
  assert.match(routeSource, /parseAdaFeedbackInput/);
  assert.match(routeSource, /created_by_email.*access\.actorEmail/s);
  assert.match(routeSource, /from\("ada_feedback"\)\.insert/);

  assert.match(widgetSource, /aria-label="Send feedback"/);
  assert.match(widgetSource, /fixed/);
  assert.match(widgetSource, /Bug or problem/);
  assert.match(widgetSource, /Idea or request/);
  assert.match(widgetSource, /adaFetch\("\/api\/ada\/feedback"/);
  assert.match(widgetSource, /workspaceId/);
  assert.match(shellSource, /<AdaFeedbackWidget workspaceId=\{workspaceId\}/);
});

test("the backlog sync creates a stable reviewable markdown backlog", () => {
  assert.ok(existsSync(syncScript));
  const source = readFileSync(syncScript, "utf8");
  assert.match(source, /ada_feedback/);
  assert.match(source, /status: "neq\.resolved"/);
  assert.match(source, /# Ada Feedback Backlog/);
  assert.match(source, /ADA_FEEDBACK_BACKLOG_PATH/);
  assert.match(source, /JSON\.stringify/);
});
