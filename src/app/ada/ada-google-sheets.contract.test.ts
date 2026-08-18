import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const adapter = join(root, "src/lib/ada-google-sheets.ts");
test("Ada Google Sheets adapter uses a dedicated service account and shared Drive folder", () => {
  assert.ok(existsSync(adapter));
  const source = readFileSync(adapter, "utf8");
  assert.match(source, /ADA_GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.match(source, /ADA_GOOGLE_DRIVE_FOLDER_ID/);
  assert.match(source, /files\.create/);
  assert.match(source, /application\/vnd\.google-apps\.spreadsheet/);
  assert.match(source, /private/i);
  assert.doesNotMatch(source, /gog/);
});
