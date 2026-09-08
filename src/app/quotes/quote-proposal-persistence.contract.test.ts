import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = join(root, "supabase/migrations/20260908152000_quote_proposals.sql");
const migration = () => {
  assert.ok(existsSync(migrationPath), "Release 2 proposal migration must exist");
  return readFileSync(migrationPath, "utf8");
};

test("Release 2 persists governed proposal snapshots and scoped lineage", () => {
  const sql = migration();
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.quote_proposals/i);
  for (const token of ["source_revision_id", "expected_row_version", "proposed_revision_json", "proposed_assumptions_json", "proposed_evidence_json", "proposed_manifest_hash", "created_by_email", "disposed_by_email", "disposed_at", "reason", "edited_revision_json", "edited_assumptions_json", "edited_evidence_json", "disposition_manifest_hash", "accepted_revision_id", "creation_idempotency_key", "disposition_idempotency_key"]) assert.match(sql, new RegExp(token));
  assert.match(sql, /FOREIGN KEY \(source_revision_id, workspace_id\)/i);
  assert.match(sql, /FOREIGN KEY \(accepted_revision_id, workspace_id\)/i);
  assert.match(sql, /status IN \('pending', 'accepted', 'rejected'\)/i);
  assert.match(sql, /expected_row_version\s*>\s*0/i);
  assert.ok(sql.includes("w.lifecycle_status NOT IN ('intake','draft','internal_review')"));
  assert.match(sql, /p_source_revision_id IS DISTINCT FROM w\.current_revision_id/);
  assert.match(sql, /Proposal creation is not allowed[\s\S]{0,140}P0001/i);
});

test("Release 2 enforces immutable shape, archive protection, RLS, and read-only tables", () => {
  const sql = migration();
  assert.ok(sql.includes("status = 'pending' AND disposed_by_email IS NULL AND disposed_at IS NULL"));
  assert.ok(sql.includes("status = 'accepted' AND nullif(btrim(disposed_by_email), '') IS NOT NULL"));
  assert.ok(sql.includes("status = 'rejected' AND nullif(btrim(disposed_by_email), '') IS NOT NULL"));
  assert.match(sql, /protect_quote_proposal_immutability/i);
  assert.match(sql, /protect_archived_quote_workspace_child/i);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\.quote_proposals/i);
  assert.match(sql, /ALTER TABLE public\.quote_proposals ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /has_quote_workspace_access/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.quote_proposals FROM anon, authenticated, service_role/i);
  assert.match(sql, /disposition_idempotency_key IS NULL OR char_length\(btrim\(disposition_idempotency_key\)\) BETWEEN 1 AND 200/i);
});

test("Release 2 exposes actor-bound authenticated-only atomic lifecycle RPCs", () => {
  const sql = migration();
  for (const routine of ["create_quote_proposal", "reject_quote_proposal", "accept_quote_proposal"]) {
    assert.match(sql, new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${routine}`, "i"));
    assert.match(sql, new RegExp(`${routine}[\\s\\S]{0,1600}SECURITY DEFINER`, "i"));
    assert.match(sql, new RegExp(`${routine}[\\s\\S]{0,5000}current_quote_actor_email`, "i"));
    assert.match(sql, new RegExp(`${routine}[\\s\\S]{0,5000}auth\\.uid\\(\\)`, "i"));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${routine}[\\s\\S]{0,160}service_role`, "i"));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${routine}[\\s\\S]{0,100}TO authenticated`, "i"));
  }
  for (const token of ["proposal_created", "proposal_rejected", "proposal_accepted", "proposal_edited", "revision_created", "normalize_legacy_quote_revision", "pg_advisory_xact_lock", "workspace_row_version"]) assert.match(sql, new RegExp(token, "i"));
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.quote_proposal_validate_snapshot\(jsonb,jsonb,jsonb\) FROM PUBLIC, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.quote_proposal_validate_snapshot/i);
});

test("Release 2 disposition logic is deterministic, scoped, and hash-bound", () => {
  const sql = migration();
  assert.match(sql, /quote_proposals_disposition_key_uq ON public\.quote_proposals\(workspace_id, disposition_idempotency_key\)/i);
  assert.match(sql, /workspace_id = p_workspace_id AND disposition_idempotency_key/i);
  assert.match(sql, /existing\.created_by_email = actor[\s\S]{0,180}proposed_manifest_hash = proposed_hash/);
  assert.match(sql, /existing\.reason IS NOT DISTINCT FROM normalized_reason[\s\S]{0,180}existing\.disposition_manifest_hash = accepted_hash/);
  assert.doesNotMatch(sql, /UPDATE public\.ada_quote_revisions SET source_manifest_hash = accepted_hash/);
  assert.match(sql, /jsonb_contains_sensitive_material\(jsonb_build_object\('revision', p_revision, 'assumptions', p_assumptions, 'evidence', p_evidence\)\)/i);
  assert.match(sql, /credential-shaped material[\s\S]{0,80}22023/i);
  assert.ok(sql.indexOf("w.row_version <> p_expected_row_version") < sql.indexOf("p_source_revision_id IS DISTINCT FROM w.current_revision_id"));
  assert.match(sql, /source_hash IS DISTINCT FROM public\.quote_manifest_sha256\(revision_json\)/i);
  assert.match(sql, /accepted_hash.*normalized_manifest_hash.*norm_hash/i);
  assert.match(sql, /existing\.disposition_manifest_hash = accepted_hash/);
  assert.match(sql, /normalized_reason\s+text/);
  assert.match(sql, /normalized_reason := nullif\(btrim\(p_reason\), ''\)/);
  assert.match(sql, /existing\.reason IS NOT DISTINCT FROM normalized_reason/);
  assert.match(sql, /reason=normalized_reason/);
  for (const token of ["40001", "55000", "proposal-created:", "proposal-rejected:", "proposal-accepted:", "proposal-edited:", "proposal-revision-created:"]) assert.match(sql, new RegExp(token, "i"));
});

test("Release 2 keeps idempotency ahead of terminal gates and preserves source lineage", () => {
  const sql = migration();
  assert.ok(sql.indexOf("WHERE workspace_id = p_workspace_id AND creation_idempotency_key") < sql.indexOf("w.archived_at IS NOT NULL"));
  assert.ok(sql.indexOf("WHERE workspace_id = p_workspace_id AND disposition_idempotency_key") < sql.indexOf("p.status <> 'pending'"));
  assert.match(sql, /source_hash IS DISTINCT FROM public\.quote_manifest_sha256\(revision_json\)/i);
  assert.match(sql, /parent_revision_id[\s\S]{0,500}p\.source_revision_id/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.quote_proposals FROM anon, authenticated, service_role/i);
  assert.match(sql, /IF TG_OP = 'DELETE'[\s\S]{0,180}55000/i);
});

test("Release 2 binds proposal evidence to deferred aggregate integrity and provenance", () => {
  const sql = migration();
  assert.match(sql, /CREATE CONSTRAINT TRIGGER/i);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/i);
  for (const key of [
    "proposal-created:",
    "proposal-edited:",
    "proposal-accepted:",
    "proposal-rejected:",
    "proposal-revision-created:",
  ]) assert.match(sql, new RegExp(key, "i"));
  for (const field of [
    "source_revision_id", "expected_row_version", "proposal_manifest_hash",
    "created_from", "proposal_id", "resulting_workspace_row_version",
    "accepted_hash", "normalized_manifest_hash", "edited",
  ]) assert.match(sql, new RegExp(field, "i"));
  assert.match(sql, /proposal_created|proposal_edited|proposal_accepted|proposal_rejected/i);
  assert.match(sql, /revision_created[\s\S]{0,240}proposal_id/i);
  assert.match(sql, /valid UUID|uuid/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.validate_quote_proposal_workflow_event\(\)[\s\S]{0,120}SECURITY DEFINER SET search_path = public/i);
  assert.match(sql, /quote_proposals WHERE id = p_proposal_id AND workspace_id = p_workspace_id FOR UPDATE/i);
  assert.match(sql, /ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE/i);
  assert.match(sql, /quote_proposals_accepted_revision_uq ON public\.quote_proposals\(accepted_revision_id\)/i);
  assert.match(sql, /NEW\.payload_json ->> 'source_revision_id' IS DISTINCT FROM p\.source_revision_id::text/);
  assert.match(sql, /NEW\.event_type = 'proposal_created'[\s\S]{0,900}NEW\.revision_id IS DISTINCT FROM p\.source_revision_id/);
  assert.match(sql, /payload_expected_version IS NULL/);
  assert.match(sql, /payload_resulting_version IS NULL/);
  assert.doesNotMatch(sql, /SELECT max\(\(e\.payload_json ->> 'resulting_workspace_row_version'\)::bigint\)/i);
  assert.match(sql, /proposal_created[\s\S]{0,900}p\.expected_row_version - 1/i);
  assert.match(sql, /proposal_rejected[\s\S]{0,900}p\.expected_row_version/i);
  assert.match(sql, /proposal_accepted[\s\S]{0,1200}p\.expected_row_version \+ CASE/i);
  assert.match(sql, /revision_created[\s\S]{0,1200}p\.expected_row_version \+ CASE/i);
  assert.match(sql, /payload_expected_version IS DISTINCT FROM expected_event_version/i);
  for (const eventType of ["proposal_rejected", "proposal_edited", "proposal_accepted", "revision_created"]) {
    assert.match(sql, new RegExp(`'${eventType}'[\\s\\S]{0,5000}'expected_row_version'`));
    assert.match(sql, new RegExp(`'${eventType}'[\\s\\S]{0,5000}'resulting_workspace_row_version'`));
  }
  assert.match(sql, /NEW\.event_type = 'proposal_edited'[\s\S]{0,500}edited_revision_json IS NULL/);
  assert.match(sql, /NEW\.event_type = 'proposal_accepted'[\s\S]{0,700}edited.*IS DISTINCT FROM/);
  assert.match(sql, /NEW\.reason IS DISTINCT FROM p\.reason/);
  assert.match(sql, /ELSE[\s\S]{0,1200}NEW\.reason IS DISTINCT FROM p\.reason/);
  assert.match(sql, /NEW\.event_type = 'revision_created'[\s\S]{0,2200}NEW\.payload_json ->> 'source_revision_id' IS DISTINCT FROM p\.source_revision_id::text/);
  assert.match(sql, /NEW\.event_type = 'revision_created'[\s\S]{0,2600}NEW\.payload_json ->> 'edited' IS DISTINCT FROM \(/);
  assert.match(sql, /NEW\.event_type = 'proposal_rejected'[\s\S]{0,700}NEW\.payload_json ->> 'source_revision_id' IS DISTINCT FROM p\.source_revision_id::text/);
  assert.doesNotMatch(sql, /coalesce\(p\.source_revision_id::text, ''\)/);
});
