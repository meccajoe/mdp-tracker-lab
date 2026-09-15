import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../../supabase/migrations/20260914173000_quote_publication_outbox.sql", import.meta.url), "utf8");

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
});
