import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const clientPath = join(root, "src/lib/ada-client.ts");
const server = readFileSync(join(root, "src/lib/ada-server.ts"), "utf8");
const browserCallers = [
  "src/components/ada-access-gate.tsx",
  "src/components/ada-workspace-shell.tsx",
  "src/components/ada-file-upload.tsx",
  "src/components/ada-intelligence-drawer.tsx",
  "src/components/ada-workspace-detail.tsx",
  "src/components/ada-evidence-viewer.tsx",
];

test("Ada browser requests carry the active Supabase bearer session", () => {
  assert.equal(existsSync(clientPath), true, "Ada needs one browser-authenticated fetch helper");
  const client = readFileSync(clientPath, "utf8");
  assert.match(client, /supabase\.auth\.getSession\(\)/);
  assert.match(client, /session\.access_token/);
  assert.match(client, /Authorization/);
  assert.match(client, /Bearer/);
  assert.match(client, /credentials:\s*["']include["']/);
});

test("Ada server authorization accepts bearer auth before denying cookie-only requests", () => {
  assert.match(server, /headers.*next\/headers/);
  assert.match(server, /authorization/);
  assert.match(server, /Bearer\\s\+/);
  assert.match(server, /auth\.getUser\(bearerToken\)/);
  assert.match(server, /cookieUser/);
});

test("Every Ada browser API caller uses the shared authenticated fetch helper", () => {
  for (const relativePath of browserCallers) {
    const source = readFileSync(join(root, relativePath), "utf8");
    assert.match(source, /import \{ adaFetch \} from "@\/lib\/ada-client"/);
    assert.doesNotMatch(source, /\bfetch\((?:`|"|')\/api\/ada/);
  }
});
