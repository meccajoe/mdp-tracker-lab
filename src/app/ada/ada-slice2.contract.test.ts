import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const createWorkspaceRoute = join(root, "src/app/api/ada/workspaces/route.ts");
const workspaceDetailRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts");
const conceptsRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/concepts/route.ts");
const messagesRoute = join(root, "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts");
const detailComponent = join(root, "src/components/ada-workspace-detail.tsx");
const shell = join(root, "src/components/ada-workspace-shell.tsx");

function conversationMigration() {
  const filename = readdirSync(migrations).find((entry) => entry.endsWith("_ada_quote_conversations.sql"));
  assert.ok(filename, "Ada conversation migration should exist");
  return readFileSync(join(migrations, filename), "utf8");
}

test("Ada conversation foundation isolates concepts and messages by quote workspace", () => {
  const migration = conversationMigration();

  assert.match(migration, /create table if not exists public\.ada_quote_concepts/i);
  assert.match(migration, /workspace_id uuid not null references public\.ada_quote_workspaces/i);
  assert.match(migration, /create table if not exists public\.ada_quote_messages/i);
  assert.match(migration, /concept_id uuid not null references public\.ada_quote_concepts/i);
  assert.match(migration, /role text not null check \(role in \('user', 'assistant', 'system'\)\)/i);
  assert.match(migration, /create table if not exists public\.ada_quote_events/i);
});

test("Ada chats retain an internal default message thread and private persistent conversation routes", () => {
  for (const path of [workspaceDetailRoute, conceptsRoute, messagesRoute, detailComponent, shell]) {
    assert.ok(existsSync(path), `${path.replace(`${root}/`, "")} should exist`);
  }

  const createSource = readFileSync(createWorkspaceRoute, "utf8");
  const workspaceDetailSource = readFileSync(workspaceDetailRoute, "utf8");
  const conceptsSource = readFileSync(conceptsRoute, "utf8");
  const messagesSource = readFileSync(messagesRoute, "utf8");
  const detailSource = readFileSync(detailComponent, "utf8");
  const shellSource = readFileSync(shell, "utf8");

  assert.match(createSource, /from\("ada_quote_concepts"\)/);
  assert.match(createSource, /Concept 1/);
  assert.match(workspaceDetailSource, /requireAdaAccess\(/);
  assert.match(workspaceDetailSource, /ada_quote_messages/);
  assert.match(conceptsSource, /requireAdaAccess\(/);
  assert.match(conceptsSource, /ada_quote_concepts/);
  assert.match(messagesSource, /requireAdaAccess\(/);
  assert.match(messagesSource, /ada_quote_messages/);
  assert.match(shellSource, /AdaWorkspaceDetail/);
  assert.match(detailSource, /let's quote something/);
  assert.doesNotMatch(detailSource, /New concept/);
  assert.match(detailSource, /Persistent conversation/);
});
