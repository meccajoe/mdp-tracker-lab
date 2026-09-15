import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../../supabase/migrations/20260914173000_quote_publication_outbox.sql", import.meta.url), "utf8");
const hardeningMigration = readFileSync(new URL("../../../supabase/migrations/20260915120000_quote_publication_outbox_hardening.sql", import.meta.url), "utf8");

test("release 4 publication outbox migration exposes durable evidence and governed RPCs", () => {
  for (const fragment of [
    "revision_id uuid",
    "external_readback_json jsonb",
    "external_readback_hash text",
    "reconciliation_status",
    "request_quote_publication",
    "record_quote_publication_readback",
    "publication_requested",
    "SECURITY DEFINER",
    "REVOKE ALL ON FUNCTION",
  ]) assert.ok(migration.includes(fragment), `missing migration contract: ${fragment}`);
  for (const fragment of [
    "payload_json IS DISTINCT FROM p_prepared_command",
    "p_payload_hash IS DISTINCT FROM lower(p_payload_hash)",
    "USING ERRCODE = 'PT409'",
    "p_outbox.revision_id",
    "PUBLICATION_READBACK_IDENTITY_MISMATCH",
    "quote_publication_reconciliation_event",
    "readback_verified",
    "conrelid = 'public.integration_outbox'::regclass",
    "integration_outbox_quote_publication_terminal_evidence_check",
  ]) assert.ok(hardeningMigration.includes(fragment), `missing hardening contract: ${fragment}`);
});
