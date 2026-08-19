import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const gateway = readFileSync(join(process.cwd(), "src/lib/ada-intelligence/gateway.ts"), "utf8");
const messages = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/messages/route.ts"), "utf8");
const drawer = readFileSync(join(process.cwd(), "src/app/api/ada/workspaces/[workspaceId]/intelligence/route.ts"), "utf8");
const server = readFileSync(join(process.cwd(), "src/lib/ada-server.ts"), "utf8");

test("Ada passes actor role and PM scope into every intelligence request", () => {
  assert.match(server, /select\("ada_access, role, pm_initials"\)/);
  assert.match(messages, /actorRole: access\.actorRole/);
  assert.match(messages, /pmInitials: access\.pmInitials/);
  assert.match(drawer, /actorRole: access\.actorRole/);
  assert.match(gateway, /buildAdaProjectScope/);
  assert.match(gateway, /\.eq\("pm", scope\.pmInitials\)/);
});

test("Ada bounds nested financial evidence to authorized project IDs", () => {
  assert.match(gateway, /authorizedProjectIds/);
  assert.match(gateway, /\.in\("project_id", authorizedProjectIds\)/);
  assert.match(gateway, /currentTrackerProjectId/);
});

test("Ada reports source failures and enforces comparable gating", () => {
  assert.match(gateway, /sourceStatus/);
  assert.match(gateway, /status: "failed"/);
  assert.match(gateway, /enforceComparableGate/);
  assert.match(gateway, /pricingAnchor/);
  assert.match(gateway, /project_summary/);
  assert.match(gateway, /buildAdaLaborSummaryEvidence/);
  assert.match(gateway, /fallbackFormulaResult/);
});
