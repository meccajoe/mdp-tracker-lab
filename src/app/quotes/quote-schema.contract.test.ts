import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = (name: string) => {
  const path = join(root, "supabase/migrations", name);
  assert.ok(existsSync(path), `${name} must exist`);
  return readFileSync(path, "utf8");
};

const foundationName = "20260903100000_quote_to_production_foundation.sql";
const membershipsName = "20260903101000_quote_workspace_memberships.sql";
const workflowName = "20260903102000_quote_workflow_events_and_outbox.sql";
const backfillName = "20260903103000_quote_normalized_backfill.sql";

test("Release 1 foundation extends workspaces and revisions without renaming the Ada aggregate", () => {
  const sql = migration(foundationName);
  for (const token of ["workspace_number", "lifecycle_status", "current_revision_id", "commercial_approved_revision_id", "hubspot_published_revision_id", "customer_accepted_revision_id", "operationally_released_revision_id", "row_version", "revision_kind", "parent_revision_id", "source_manifest_hash", "normalization_status", "formula_policy_version", "created_from", "locked_at"]) assert.match(sql, new RegExp(token));
  assert.match(sql, /ALTER TABLE public\.ada_quote_workspaces/i);
  assert.match(sql, /ALTER TABLE public\.ada_quote_revisions/i);
  assert.doesNotMatch(sql, /ALTER TABLE public\.ada_quote_workspaces\s+RENAME/i);
});

test("Release 1 creates normalized lines work packages mappings work types and labor allocations", () => {
  const sql = migration(foundationName);
  for (const table of ["quote_revision_lines", "work_packages", "quote_revision_work_packages", "quote_revision_line_work_packages", "work_types", "quote_revision_work_package_labor"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i"));
  assert.match(sql, /UNIQUE[\s\S]*revision_id[\s\S]*work_package_id/i);
  assert.match(sql, /WHERE project_id IS NOT NULL/i);
  assert.match(sql, /allocation_pct[\s\S]*BETWEEN 0 AND 1/i);
  assert.match(sql, /allocation_status[\s\S]*unallocated/i);
  assert.match(sql, /quote_revision_work_packages \([\s\S]*workspace_id uuid NOT NULL/i);
  assert.match(sql, /quote_revision_work_packages_revision_workspace_fk[\s\S]*FOREIGN KEY \(revision_id, workspace_id\)/i);
  assert.match(sql, /quote_revision_work_packages_package_workspace_fk[\s\S]*FOREIGN KEY \(work_package_id, workspace_id\)/i);
  assert.match(sql, /quote_revision_line_work_packages_package_fk[\s\S]*FOREIGN KEY \(revision_work_package_id, revision_id, workspace_id\)/i);
});

test("governed quote history replaces cascade deletion and enforces locked immutability", () => {
  const sql = migration(foundationName);
  assert.match(sql, /ON DELETE RESTRICT/i);
  assert.match(sql, /protect_locked_quote_revision/i);
  assert.match(sql, /protect_locked_quote_revision_child/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.ada_quote_revisions/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.quote_revision_lines/i);
  assert.match(sql, /OLD\.revision_id/i);
  assert.match(sql, /NEW\.revision_id/i);
});

test("membership and capabilities are normalized without hard-coded people", () => {
  const sql = migration(membershipsName);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.quote_workspace_members/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.quote_user_capabilities/i);
  assert.match(sql, /email_normalized/i);
  assert.match(sql, /workspace_role[\s\S]*(owner|editor|reviewer|viewer)/i);
  assert.match(sql, /WHERE removed_at IS NULL/i);
  assert.match(sql, /break_glass/i);
  assert.match(sql, /INSERT INTO public\.quote_user_capabilities[\s\S]*'create_workspace'[\s\S]*FROM public\.user_roles[\s\S]*ada_access/i);
  assert.doesNotMatch(sql, /paul@|rooster@|joe@/i);
});

test("workspace creation is atomic capability-gated and immediately discoverable", () => {
  const sql = migration("20260903103000_quote_normalized_backfill.sql");
  const route = readFileSync(join(root, "src/app/api/ada/workspaces/route.ts"), "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_quote_workspace/i);
  assert.match(sql, /capability\s*=\s*'create_workspace'/i);
  assert.match(sql, /INSERT INTO public\.quote_workspace_members/i);
  assert.match(sql, /INSERT INTO public\.ada_quote_concepts/i);
  assert.match(sql, /append_quote_workflow_event[\s\S]*'workspace_created'/i);
  assert.match(route, /actorSupabase[\s\S]*\.rpc\("create_quote_workspace"/i);
  assert.doesNotMatch(route, /from\("ada_quote_workspaces"\)[\s\S]{0,120}\.insert\(/i);
  assert.match(route, /from\("quote_workspace_members"\)[\s\S]{0,180}workspace_id/i);
  assert.doesNotMatch(route, /\.eq\("created_by_email",\s*admin\.actorEmail\)/i);
});

test("normalized workspace authorization does not depend on legacy Ada access and binds actor identity", () => {
  const helper = readFileSync(join(root, "src/lib/ada-server.ts"), "utf8");
  const membershipSql = migration(membershipsName);
  const workflowSql = migration(workflowName);
  const backfillSql = migration("20260903103000_quote_normalized_backfill.sql");
  assert.match(helper, /requireAdaWorkspaceAccess[\s\S]*requireAdaIdentity\(/i);
  assert.doesNotMatch(helper, /requireAdaWorkspaceAccess[\s\S]{0,180}requireAdaAccess\(/i);
  assert.match(helper, /actorId:\s*user\.id/i);
  assert.match(helper, /\.eq\("user_id",\s*access\.actorId\)/i);
  for (const sql of [membershipSql, workflowSql, backfillSql]) assert.match(sql, /auth\.uid\(\)/i);
});

test("legacy acceptance adapter records commercial approval without customer acceptance projection", () => {
  const sql = migration("20260903103000_quote_normalized_backfill.sql");
  const acceptRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/accept/route.ts"), "utf8");
  const previewRoute = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/handoff-preview/route.ts"), "utf8");
  assert.match(sql, /RETURNS TABLE\(commercial_approved_revision_id/i);
  assert.doesNotMatch(sql, /SET status = 'accepted'/i);
  assert.doesNotMatch(sql, /'quote_accepted'/i);
  assert.match(acceptRoute, /commercialApprovedRevisionId/);
  assert.match(acceptRoute, /status: "commercial_approved"/);
  assert.doesNotMatch(acceptRoute, /status: "accepted"/);
  assert.match(previewRoute, /customer_accepted_revision_id/);
  assert.match(previewRoute, /event_type[\s\S]*customer_accepted/i);
  assert.doesNotMatch(previewRoute, /workspace\.status !== "accepted"/);
});

test("RLS grants member reads but no direct authenticated mutation path", () => {
  const sql = migration(membershipsName);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/gi);
  assert.match(sql, /CREATE POLICY quote_workspace_member_read/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE[\s\S]*authenticated/i);
  assert.match(sql, /has_quote_workspace_access/i);
  assert.doesNotMatch(sql, /FOR ALL TO authenticated USING \(true\)/i);
});

test("workflow ledger is append-only and records full transition evidence", () => {
  const sql = migration(workflowName);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.quote_workflow_events/i);
  for (const token of ["event_id", "workspace_id", "revision_id", "actor_email", "actor_role", "actor_capability", "prior_state", "resulting_state", "reason", "evidence_refs", "payload_json", "idempotency_key"]) assert.match(sql, new RegExp(token));
  assert.match(sql, /reject_append_only_mutation/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.quote_workflow_events/i);
  assert.match(sql, /UNIQUE[\s\S]*idempotency_key/i);
  assert.match(sql, /current_quote_actor_email/i);
  assert.match(sql, /revision_workspace_id/i);
  assert.match(sql, /validate_quote_event_evidence/i);
  assert.match(sql, /commercial_approved_revision_id\s*=\s*CASE/i);
  assert.match(sql, /hubspot_published_revision_id\s*=\s*CASE/i);
  assert.match(sql, /customer_accepted_revision_id\s*=\s*CASE/i);
  assert.match(sql, /operationally_released_revision_id\s*=\s*CASE/i);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated/i);
  assert.doesNotMatch(sql, /^GRANT EXECUTE ON FUNCTION public\.append_quote_workflow_event.* TO service_role;$/im);
});

test("outbox has durable identity bounded retry and protected payload fields", () => {
  const sql = migration(workflowName);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.integration_outbox/i);
  for (const token of ["destination", "operation", "idempotency_key", "external_identity", "payload_json", "payload_hash", "attempt_count", "max_attempts", "lease_owner", "lease_expires_at", "next_attempt_at", "last_error_code", "last_error_message", "completed_at"]) assert.match(sql, new RegExp(token));
  assert.match(sql, /pending[\s\S]*processing[\s\S]*succeeded[\s\S]*retryable_failed[\s\S]*terminal_failed[\s\S]*cancelled/i);
  assert.match(sql, /protect_integration_outbox_identity/i);
  assert.match(sql, /jsonb_contains_sensitive_material/i);
  assert.match(sql, /external_identity[\s\S]*last_error_message/i);
  assert.match(sql, /scalar_value\s*<>\s*'\[REDACTED\]'/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.integration_outbox FROM anon, authenticated/i);
});

test("normalization backfill is deterministic idempotent and fail closed", () => {
  const sql = migration(backfillName);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.quote_revision_normalization_exceptions/i);
  assert.match(sql, /revision_id[\s\S]*source_hash[\s\S]*UNIQUE/i);
  assert.match(sql, /jsonb_array_elements/i);
  assert.match(sql, /ORDER BY[\s\S]*revision_number/i);
  assert.match(sql, /ON CONFLICT/i);
  assert.match(sql, /needs_review/i);
  assert.match(sql, /mismatch/i);
  assert.match(sql, /source_manifest_hash/i);
  assert.match(sql, /normalized_at/i);
  assert.doesNotMatch(sql, /random\(\)/i);
});

test("legacy revision RPC dual-writes normalized rows and blocks unstable acceptance", () => {
  const sql = migration(backfillName);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_ada_quote_revision/i);
  assert.match(sql, /normalize_legacy_quote_revision\(created_revision\.id\)/i);
  assert.match(sql, /append_quote_workflow_event\([\s\S]*'revision_created'/i);
  assert.match(sql, /CREATE (?:OR REPLACE )?FUNCTION public\.accept_ada_quote_revision/i);
  assert.match(sql, /append_quote_workflow_event\([\s\S]*'commercial_approved'/i);
  assert.match(sql, /approve_commercial/i);
  assert.doesNotMatch(sql, /append_quote_workflow_event\([\s\S]*'customer_accepted'/i);
  assert.match(sql, /normalization_status\s*<>\s*'normalized'/i);
  assert.match(sql, /stable normalized manifest/i);
});

test("Ada server delegates workspace authorization to shared membership permissions", () => {
  const source = readFileSync(join(root, "src/lib/ada-server.ts"), "utf8");
  assert.match(source, /resolveQuoteWorkspaceAuthorization/);
  assert.match(source, /canPerformQuoteAction/);
  assert.doesNotMatch(source, /eq\("created_by_email", access\.actorEmail\)\.maybeSingle\(\)/);
});

test("existing Ada workspace mutation routes use shared workspace authorization", () => {
  const revise = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/revise/route.ts"), "utf8");
  const workspace = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/route.ts"), "utf8");
  assert.match(revise, /requireAdaWorkspaceAccess/);
  assert.match(workspace, /requireAdaWorkspaceAccess/);
  assert.doesNotMatch(revise, /created_by_email/);
});

test("service-backed Ada mutation routes require an explicit quote action", () => {
  const cases = [
    ["src/app/api/ada/workspaces/[workspaceId]/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "edit_draft")', 'requireAdaWorkspaceAccess(workspaceId, "archive_workspace")'],
    ["src/app/api/ada/workspaces/[workspaceId]/assets/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "attach_evidence")'],
    ["src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "edit_draft")'],
    ["src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/analyze/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "attach_evidence")'],
    ["src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/complete/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "attach_evidence")'],
    ["src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/initial-quote/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "edit_draft")'],
    ["src/app/api/ada/workspaces/[workspaceId]/revise/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "edit_draft")'],
    ["src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/accept/route.ts", 'requireAdaWorkspaceAccess(workspaceId, "approve_commercial")'],
  ] as const;
  for (const [path, ...requirements] of cases) {
    const source = readFileSync(join(root, path), "utf8");
    for (const requirement of requirements) assert.ok(source.includes(requirement), `${path} must enforce ${requirement}`);
  }
});

test("workspace-scoped compatibility reads use membership authorization", () => {
  for (const relativePath of [
    "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/xlsx/route.ts",
    "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/handoff-preview/route.ts",
    "src/app/api/ada/workspaces/[workspaceId]/intelligence/route.ts",
  ]) {
    const source = readFileSync(join(root, relativePath), "utf8");
    assert.match(source, /requireAdaWorkspaceAccess\(workspaceId\)/i, `${relativePath} must authorize membership`);
    assert.doesNotMatch(source, /created_by_email[\s\S]{0,120}actorEmail/i, `${relativePath} must not re-impose creator-only access`);
  }
});

test("initial quote failures never delete an immutable revision", () => {
  const initialQuote = readFileSync(join(root, "src/app/api/ada/workspaces/[workspaceId]/assets/[assetId]/initial-quote/route.ts"), "utf8");
  assert.doesNotMatch(initialQuote, /from\("ada_quote_revisions"\)\.delete\(\)/);
});

test("UI-safe types expose quote workflow identity without wage evidence", () => {
  const source = readFileSync(join(root, "src/lib/types.ts"), "utf8");
  assert.match(source, /export interface QuoteWorkspace/);
  assert.match(source, /export interface QuoteRevision/);
  assert.match(source, /export interface WorkPackage/);
  assert.doesNotMatch(source, /QuoteWorkspace[\s\S]{0,800}hourly_rate/i);
});
