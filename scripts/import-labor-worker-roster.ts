import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { buildLaborWorkerRosterSnapshot } from "../src/lib/labor-worker-roster";

const file = process.argv[2];
const snapshotDate = process.argv[3] ?? new Date().toISOString().slice(0, 10);
if (!file) throw new Error("Usage: tsx scripts/import-labor-worker-roster.ts <roster.xlsx> [YYYY-MM-DD]");

const workbook = XLSX.readFile(file);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
const snapshot = buildLaborWorkerRosterSnapshot(rows.map((row) => ({
  employee: String(row.Employee ?? ""),
  classification: String(row["Employee/Contractor"] ?? ""),
  note: String(row["as of 2/10/25"] ?? ""),
})), snapshotDate);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { error } = await supabase.from("labor_worker_classifications").upsert(snapshot, { onConflict: "normalized_name,roster_snapshot_date" });
if (error) throw error;
console.log(JSON.stringify({ snapshotDate, imported: snapshot.length }, null, 2));
