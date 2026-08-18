import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const pane = join(root, "src/components/ada-sheet-pane.tsx");
const detail = join(root, "src/components/ada-workspace-detail.tsx");
test("Ada uses a native Sheet pane fallback when Google editor embedding requires login", () => {
  assert.ok(existsSync(pane));
  const paneSource = readFileSync(pane, "utf8");
  const detailSource = readFileSync(detail, "utf8");
  assert.match(paneSource, /Working sheet/);
  assert.match(paneSource, /Open in Google Sheets/);
  assert.match(paneSource, /Google editor opens in a separate tab/);
  assert.match(detailSource, /AdaSheetPane/);
  assert.match(detailSource, /Open working sheet pane/);
});
