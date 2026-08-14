import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const appShell = readFileSync(join(root, "src/components/AppShell.tsx"), "utf8");
const adaShell = readFileSync(join(root, "src/components/ada-workspace-shell.tsx"), "utf8");
const adaSurface = readFileSync(join(root, "src/components/ada-workspace-surface.tsx"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
const evidence = readFileSync(join(root, "src/components/ada-evidence-viewer.tsx"), "utf8");

test("Ada owns a focused workspace shell instead of nesting inside Tracker chrome", () => {
  assert.match(appShell, /isAdaWorkspace/);
  assert.match(appShell, /pathname\.startsWith\("\/ada"\)/);
  assert.match(appShell, /data-slot="ada-workspace-shell"/);
  assert.match(adaShell, /quoteLibraryCollapsed/);
  assert.match(adaSurface, /aria-label="Collapse quote library"/);
  assert.match(adaSurface, /ada-app-shell/);
});

test("Ada defaults to conversation focus and opens evidence only on demand", () => {
  assert.match(adaShell, /filterMenuOpen/);
  assert.match(adaSurface, /Filter/);
  assert.match(detail, /showEvidence/);
  assert.match(detail, /Open files/);
  assert.match(detail, /aria-label="Open files"/);
  assert.match(detail, /showEvidence && <AdaEvidenceViewer/);
  assert.match(evidence, /aria-label="Evidence viewer"/);
  assert.doesNotMatch(evidence, /rounded-lg border border-border bg-background p-3/);
});
