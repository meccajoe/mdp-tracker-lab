import assert from "node:assert/strict";
import test from "node:test";

const roster = await import(`../src/lib/labor-worker-roster.ts?test=${Date.now()}`);

test("builds a dated roster snapshot with approved aliases and Rogelio employee override", () => {
  const rows = roster.buildLaborWorkerRosterSnapshot([
    { employee: "Daniel Guiterrez", classification: "E" },
    { employee: "Rogelio Cervantes", classification: "C" },
    { employee: "Rogelio Cervantes", classification: "E" },
  ], "2026-08-14");

  assert.deepEqual(rows, [
    { normalized_name: "daniel gutierrez", display_name: "Daniel Guiterrez", classification: "employee", roster_snapshot_date: "2026-08-14", source: "maribel_payroll_roster", notes: "" },
    { normalized_name: "rogelio cervantes", display_name: "Rogelio Cervantes", classification: "employee", roster_snapshot_date: "2026-08-14", source: "maribel_payroll_roster", notes: "Visible E roster row is authoritative; hidden C row ignored." },
  ]);
  assert.equal(roster.normalizeLaborWorkerName("Henry Ledezma (Mireles)"), "henry ledezma mireles");
});
