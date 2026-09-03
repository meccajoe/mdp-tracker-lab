import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appShellPath = path.join(repoRoot, "src", "components", "AppShell.tsx");
const wipPath = path.join(repoRoot, "src", "app", "admin", "reports", "wip", "page.tsx");
const projectDetailPath = path.join(repoRoot, "src", "app", "projects", "[id]", "page.tsx");
const flagsPath = path.join(repoRoot, "src", "app", "admin", "flags", "page.tsx");
const vendorsPath = path.join(repoRoot, "src", "app", "admin", "vendors", "page.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

test("global app shell and table-heavy tracker pages use widened content containers on large screens", () => {
  const appShell = read(appShellPath);
  const wip = read(wipPath);
  const projectDetail = read(projectDetailPath);
  const flags = read(flagsPath);
  const vendors = read(vendorsPath);

  assert.match(appShell, /max-w-\[1800px\]|max-w-screen-2xl/);
  assert.doesNotMatch(appShell, /max-w-7xl/);

  for (const source of [wip, projectDetail, flags, vendors]) {
    assert.doesNotMatch(source, /max-w-6xl|max-w-7xl/);
  }
});
