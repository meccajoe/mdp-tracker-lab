import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const detail = readFileSync(join(process.cwd(), "src/components/ada-workspace-detail.tsx"), "utf8");

test("Ada chat shows thinking, citations, and selected evidence context", () => {
  assert.match(detail, /Ada is thinking/);
  assert.match(detail, /structured_payload_json/);
  assert.match(detail, /citations/);
  assert.match(detail, /Discussing:/);
  assert.match(detail, /evidenceContext/);
  assert.match(detail, /selectedEvidenceAssetId/);
});
