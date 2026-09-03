import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubspotFixturePath = path.join(
  repoRoot,
  "tests/fixtures/hubspot-quote-publication/quote-status-contract.json"
);
const qbtFixturePath = path.join(
  repoRoot,
  "tests/fixtures/qbt-work-package-pilot/custom-field-contract.json"
);
const probePath = path.join(
  repoRoot,
  "docs/research/2026-09-03-hubspot-quote-acceptance-probe.md"
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function assertSanitized(value, location = "fixture") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        /authorization|access.?token|refresh.?token|password|secret|credential/i,
        `${location}.${key} must not persist a credential-bearing field`
      );
      assertSanitized(entry, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    assert.doesNotMatch(
      value,
      /Bearer\s+\S+|pat-[a-z0-9-]+|eyJ[A-Za-z0-9_-]{20,}/i,
      `${location} contains a token-like value`
    );
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

test("Release 0 persists a sanitized HubSpot quote-status contract", () => {
  const fixture = readJson("tests/fixtures/hubspot-quote-publication/quote-status-contract.json");

  assert.equal(fixture.source.system, "hubspot");
  assert.equal(fixture.source.mode, "read_only");
  assert.equal(fixture.acceptance.property, "hs_quote_status");
  assert.equal(fixture.acceptance.accepted_value, "ACCEPTED");
  assert.equal(fixture.acceptance.published_value, "PUBLISHED");
  assert.ok(fixture.property.options.includes("ACCEPTED"));
  assert.ok(fixture.property.options.includes("PUBLISHED"));
  assert.equal(fixture.acceptance_probe.accepted_date_count, 0);
  assert.equal(fixture.acceptance_probe.signed_sample.hs_quote_esign_status, "SIGNED");
  assertSanitized(fixture);
  assert.equal(
    canonicalJson(fixture),
    canonicalJson(readJson("tests/fixtures/hubspot-quote-publication/quote-status-contract.json"))
  );
});

test("Release 0 persists a sanitized published-quote read-back shape", () => {
  const fixture = readJson("tests/fixtures/hubspot-quote-publication/published-readback-contract.json");

  assert.equal(fixture.source.system, "hubspot");
  assert.equal(fixture.source.mode, "read_only");
  assert.equal(fixture.quote_readback.properties.hs_quote_status, "PUBLISHED");
  assert.equal(fixture.quote_readback.associated_deal_count, 1);
  assert.ok(fixture.quote_readback.associated_line_item_count > 0);
  assert.equal(fixture.line_item_readback.length, fixture.quote_readback.associated_line_item_count);
  assertSanitized(fixture);
  assert.equal(
    canonicalJson(fixture),
    canonicalJson(readJson("tests/fixtures/hubspot-quote-publication/published-readback-contract.json"))
  );
});

test("Release 0 persists sanitized QBT custom-field and labor payload shapes", () => {
  const fixture = readJson("tests/fixtures/qbt-work-package-pilot/custom-field-contract.json");

  assert.equal(fixture.source.system, "quickbooks_time");
  assert.equal(fixture.source.mode, "read_only");
  assert.deepEqual(
    fixture.custom_fields.map((field) => field.id),
    ["2883322", "957306", "2883364"]
  );
  assert.equal(fixture.labor_payload.customfields["2883322"] !== undefined, true);
  assert.equal(fixture.labor_payload.customfields["957306"] !== undefined, true);
  assert.equal(typeof fixture.labor_payload.customfields["957306"], "string");
  assert.equal(fixture.replay_contract.payload_value_shape.includes("labels or empty strings"), true);
  assert.equal(fixture.correction_contract.current_snapshot_only, true);
  assert.equal(fixture.correction_contract.deleted_timesheet_shape.endpoint_available, true);
  assertSanitized(fixture);
  assert.equal(
    canonicalJson(fixture),
    canonicalJson(readJson("tests/fixtures/qbt-work-package-pilot/custom-field-contract.json"))
  );
});

test("Release 0 documents the live probe and does not add mutation endpoints", () => {
  const probe = fs.readFileSync(probePath, "utf8");
  assert.match(probe, /read-only/i);
  assert.match(probe, /hs_quote_status/);
  assert.match(probe, /2883322/);
  assert.match(probe, /957306/);
  assert.match(probe, /correction lineage/i);

  const forbiddenReleaseZeroRoutes = [
    "src/app/api/quote-workspaces/[workspaceId]/revisions/[revisionId]/publish/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/acceptance/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/approve-release/route.ts",
    "src/app/api/quote-workspaces/[workspaceId]/release/route.ts",
  ];
  for (const route of forbiddenReleaseZeroRoutes) {
    assert.equal(fs.existsSync(path.join(repoRoot, route)), false, `${route} must not exist in Release 0`);
  }
});
