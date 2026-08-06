import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Labor Reconciliation is a Reports navigation item, not a Settings item", async () => {
  const sidebar = await read("src/components/Sidebar.tsx");
  const reportsStart = sidebar.indexOf('{/* Reports section — admin only */}');
  const settingsStart = sidebar.indexOf('{/* Settings section — admin only */}');
  const laborLink = '<NavLink href="/admin/labor-reconciliation" label="Labor Reconciliation"';

  assert.ok(reportsStart >= 0, "Reports section should exist");
  assert.ok(settingsStart > reportsStart, "Settings section should follow Reports");
  assert.ok(sidebar.indexOf(laborLink) > reportsStart, "Labor Reconciliation should be listed under Reports");
  assert.ok(sidebar.indexOf(laborLink) < settingsStart, "Labor Reconciliation should not remain under Settings");
});

test("Labor Reconciliation receives a specific mobile page label", async () => {
  const shell = await read("src/components/AppShell.tsx");
  assert.match(shell, /pathname\.startsWith\("\/admin\/labor-reconciliation"\).*?return "Labor Reconciliation"/s);
});
