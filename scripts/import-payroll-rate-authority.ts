#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

import { normalizeLaborWorkerName } from "../src/lib/labor-worker-roster";
import { buildPayrollRateAuthorityRecords, classifyPayrollRateRows, parsePayrollDate, type PayrollRateInputRow } from "../src/lib/payroll-rate-authority";

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fileArg = args[0];
  const expectedHash = option(args, "--confirm-source-sha");
  const approvedBy = option(args, "--approved-by");
  const supersedesImportId = option(args, "--supersedes-import-id");
  const supersessionReason = option(args, "--supersession-reason");
  if (!fileArg || fileArg.startsWith("--")) {
    throw new Error("Usage: import-payroll-rate-authority.ts <workbook.xlsx> [--apply --confirm-source-sha <sha256> --approved-by <identity>]");
  }

  const workbookPath = resolve(fileArg);
  const fileBuffer = readFileSync(workbookPath);
  const sourceSha256 = createHash("sha256").update(fileBuffer).digest("hex");
  if (apply && expectedHash !== sourceSha256) throw new Error(`Apply requires --confirm-source-sha ${sourceSha256}`);
  if (apply && !approvedBy?.trim()) throw new Error("Apply requires --approved-by <identity>");
  if (Boolean(supersedesImportId) !== Boolean(supersessionReason)) {
    throw new Error("--supersedes-import-id and --supersession-reason must be provided together");
  }

  dotenv.config({ path: process.env.MDP_TRACKER_ENV_FILE ?? resolve(process.cwd(), ".env.local"), quiet: true });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase environment configuration");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, { header: 1, defval: null, raw: true });
  const header = rawRows[0] ?? [];
  const baselineMatch = String(header[7] ?? "").match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (!baselineMatch) throw new Error("Workbook is missing an 'as of' date in H1");
  const baselineDate = parsePayrollDate(baselineMatch[1]);

  const workbookModified = workbook.Props?.ModifiedDate;
  if (!workbookModified) throw new Error("Workbook is missing a modified timestamp");
  const sourceModifiedAt = new Date(workbookModified).toISOString();

  const payrollRows: PayrollRateInputRow[] = [];
  for (let index = 1; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    const employee = String(row[0] ?? "").trim();
    const classification = String(row[1] ?? "").trim();
    const parsedRate = typeof row[2] === "number" ? row[2] : Number(row[2]);
    const standardRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null;
    const note = row.slice(7).filter((value) => typeof value === "string" && value.trim()).join(" | ").trim();
    if (!employee) continue;
    payrollRows.push({ employee, classification, standardRate, note, sourceRowNumber: index + 1 });
  }

  async function readAllLabor() {
    const output: Array<{ id: number; employee_name: string; date: string }> = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("qbo_labor_entries")
        .select("id,employee_name,date")
        .like("qbo_entry_id", "ts_%")
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      output.push(...(data ?? []));
      if (!data || data.length < 1000) return output;
    }
  }

  const firstObservedDates = new Map<string, string>();
  for (const row of await readAllLabor()) {
    const key = normalizeLaborWorkerName(row.employee_name);
    const candidate = row.date < baselineDate ? baselineDate : row.date;
    const current = firstObservedDates.get(key);
    if (!current || candidate < current) firstObservedDates.set(key, candidate);
  }

  const authorityRecords = buildPayrollRateAuthorityRecords(payrollRows, {
    sourceLabel: "Friday payroll rates",
    sourceModifiedAt,
    baselineDate,
  }, firstObservedDates);
  const rateRows = authorityRecords.map((record) => ({
    normalized_name: record.normalizedName,
    display_name: record.displayName,
    classification: record.classification,
    base_hourly_rate: record.baseHourlyRate,
    effective_start_date: record.effectiveStartDate,
    effective_end_date: record.effectiveEndDate,
    source_row_number: record.sourceRowNumber,
    source_note: record.sourceNote,
  }));
  const rowOutcomes = classifyPayrollRateRows(payrollRows, authorityRecords);
  const outcomeCounts = Object.fromEntries(
    ["imported", "invalid_rate", "terminated", "duplicate_superseded", "invalid_classification", "skipped"].map((outcome) => [
      outcome,
      rowOutcomes.filter((row) => row.outcome === outcome).length,
    ]),
  );

  const joeConfirmedDesigners = ["Rodrigo L", "Marcelo T", "Mariam H"].map((displayName) => ({
    normalized_name: normalizeLaborWorkerName(displayName),
    display_name: displayName,
    classification: "contractor",
    roster_snapshot_date: "2026-09-18",
    source: "joe_confirmation",
    notes: "Contractor designer; rate not supplied in the payroll workbook.",
  }));

  if (apply) {
    const { data: importId, error: importError } = await supabase.rpc("import_labor_rate_authority", {
      import_source_label: "Friday payroll rates",
      import_source_file_name: basename(workbookPath),
      import_source_sha256: sourceSha256,
      import_source_modified_at: sourceModifiedAt,
      import_baseline_date: baselineDate,
      import_approved_by: approvedBy,
      rate_rows: rateRows,
      classification_rows: joeConfirmedDesigners,
      import_supersedes_id: supersedesImportId,
      supersession_reason: supersessionReason,
    });
    if (importError) throw importError;

    const { data: manifest, error: manifestError } = await supabase.from("labor_rate_imports")
      .select("id,source_sha256,approved_by,approved_at,revoked_at")
      .eq("id", importId)
      .single();
    if (manifestError) throw manifestError;
    const { count: importedCount, error: verifyRateError } = await supabase.from("labor_worker_rate_authority")
      .select("id", { count: "exact", head: true })
      .eq("import_id", importId);
    if (verifyRateError) throw verifyRateError;
    const expectedDesignerClassifications = joeConfirmedDesigners
      .map((row) => ({ normalized_name: row.normalized_name, classification: row.classification }))
      .sort((a, b) => a.normalized_name.localeCompare(b.normalized_name));
    const { data: verifiedDesigners, error: verifyClassificationError } = await supabase.from("labor_worker_classifications")
      .select("normalized_name,classification")
      .eq("source", "joe_confirmation")
      .eq("roster_snapshot_date", "2026-09-18")
      .in("normalized_name", expectedDesignerClassifications.map((row) => row.normalized_name));
    if (verifyClassificationError) throw verifyClassificationError;
    const actualDesignerClassifications = (verifiedDesigners ?? [])
      .map((row) => ({ normalized_name: row.normalized_name, classification: row.classification }))
      .sort((a, b) => a.normalized_name.localeCompare(b.normalized_name));
    if (manifest.source_sha256 !== sourceSha256 || manifest.revoked_at || importedCount !== rateRows.length
      || JSON.stringify(actualDesignerClassifications) !== JSON.stringify(expectedDesignerClassifications)) {
      throw new Error("Post-import verification failed");
    }
    console.log(JSON.stringify({ mode: "applied", manifest, importedRateRecordCount: importedCount, verifiedDesigners: actualDesignerClassifications }, null, 2));
  } else {
    console.log(JSON.stringify({
      mode: "preview",
      sourceSha256,
      sourceModifiedAt,
      baselineDate,
      payrollRows: payrollRows.length,
      authorityRecords: rateRows.length,
      outcomeCounts,
      rowOutcomes,
      classificationUpdates: joeConfirmedDesigners,
      records: rateRows,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
