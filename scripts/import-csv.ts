// Usage: npx tsx scripts/import-csv.ts
//
// One-time CSV import script for migrating data from the existing
// Google Sheet ("MDP - Project Tracker (Beta)") into Supabase.
//
// Prerequisites:
//   1. Export "Deal Hub" and "Expense Hub" tabs as CSV files
//   2. Place them in data/deal-hub.csv and data/expense-hub.csv
//   3. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..");
config({ path: resolve(ROOT, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields (including embedded
 * commas and escaped double-quotes) without pulling in a third-party library.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;

  while (i < text.length) {
    const row: string[] = [];

    while (i < text.length) {
      let value = "";

      // Skip leading whitespace before a field (but not newlines)
      while (i < text.length && text[i] === " ") i++;

      if (i < text.length && text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
      } else {
        // Unquoted field
        while (i < text.length && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          value += text[i];
          i++;
        }
        value = value.trimEnd();
      }

      row.push(value);

      if (i < text.length && text[i] === ",") {
        i++; // skip comma, continue to next field
      } else {
        break; // end of row
      }
    }

    // Skip line endings
    if (i < text.length && text[i] === "\r") i++;
    if (i < text.length && text[i] === "\n") i++;

    // Skip completely empty rows
    if (row.length === 1 && row[0] === "") continue;

    rows.push(row);
  }

  return rows;
}

/** Parse a CSV file into an array of objects keyed by header names. */
function csvToObjects(filePath: string): Record<string, string>[] {
  const text = readFileSync(filePath, "utf-8");
  const rows = parseCSV(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const objects: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const val = (row[c] ?? "").trim();
      obj[headers[c]] = val;
      if (val) hasValue = true;
    }
    if (hasValue) objects.push(obj);
  }

  return objects;
}

// ---------------------------------------------------------------------------
// Data cleaning helpers
// ---------------------------------------------------------------------------

/** Strip currency formatting: "$1,234.56" -> 1234.56, "" -> null */
function parseCurrency(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Parse a numeric value (hours, etc.) */
function parseNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Normalize date strings to ISO format (YYYY-MM-DD).
 * Handles M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, and similar variants.
 */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // M/D/YYYY or MM/DD/YYYY (with optional dashes instead of slashes)
  const mdyMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (mdyMatch) {
    const month = mdyMatch[1].padStart(2, "0");
    const day = mdyMatch[2].padStart(2, "0");
    let year = mdyMatch[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Try native Date as last resort
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  console.warn(`  Warning: could not parse date "${raw}"`);
  return null;
}

/** Parse boolean-ish values */
function parseBool(raw: string): boolean {
  const v = raw.toLowerCase().trim();
  return v === "true" || v === "yes" || v === "1" || v === "x";
}

// ---------------------------------------------------------------------------
// Column mapping helpers
// ---------------------------------------------------------------------------

/** Get a value from a row using flexible header matching (case-insensitive, trimmed). */
function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const lower = c.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().trim() === lower) {
        return row[key];
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Import: Deal Hub -> projects
// ---------------------------------------------------------------------------

async function importProjects() {
  const filePath = resolve(ROOT, "data/deal-hub.csv");
  if (!existsSync(filePath)) {
    console.log("Skipping projects import: data/deal-hub.csv not found");
    return;
  }

  console.log("Reading data/deal-hub.csv...");
  const rows = csvToObjects(filePath);
  console.log(`  Parsed ${rows.length} rows`);

  const projects = rows
    .map((r) => {
      const id = col(r, "Project #", "Project#", "Project Number", "ID").trim();
      if (!id) return null;

      return {
        id,
        name: col(r, "Project Name", "Name") || null,
        client: col(r, "Client") || null,
        pm: col(r, "PM") || null,
        close_date: parseDate(col(r, "Close Date", "CloseDate")),
        contract_amount: parseCurrency(col(r, "Contract Amount", "Contract")),
        status: col(r, "Status") || "Active",
        notes: col(r, "Notes") || null,
        budget_hrs: parseNumber(col(r, "Budgeted Hrs", "Budget Hrs", "Budgeted Hours")),
        budget_design: parseCurrency(col(r, "Budget Design")),
        budget_pm: parseCurrency(col(r, "Budget PM")),
        budget_shipping: parseCurrency(col(r, "Budget Shipping")),
        budget_id_labor: parseCurrency(col(r, "Budget I&D Labor", "Budget ID Labor")),
        budget_travel: parseCurrency(col(r, "Budget Travel")),
        budget_props: parseCurrency(col(r, "Budget Props")),
        budget_equipment: parseCurrency(col(r, "Budget Equipment")),
        budget_flooring: parseCurrency(col(r, "Budget Flooring")),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  console.log(`  Mapped ${projects.length} projects for import`);

  let imported = 0;
  for (let i = 0; i < projects.length; i += BATCH_SIZE) {
    const batch = projects.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("projects").upsert(batch);
    if (error) {
      console.error(`  Error inserting projects batch ${i}-${i + batch.length}:`, error.message);
    } else {
      imported += batch.length;
    }
  }

  console.log(`Imported ${imported} projects`);
}

// ---------------------------------------------------------------------------
// Import: Expense Hub -> expenses
// ---------------------------------------------------------------------------

async function importExpenses() {
  const filePath = resolve(ROOT, "data/expense-hub.csv");
  if (!existsSync(filePath)) {
    console.log("Skipping expenses import: data/expense-hub.csv not found");
    return;
  }

  console.log("Reading data/expense-hub.csv...");
  const rows = csvToObjects(filePath);
  console.log(`  Parsed ${rows.length} rows`);

  const expenses = rows
    .map((r) => {
      const projectId = col(r, "Project #", "Project#", "Project Number", "ProjectID").trim();
      const date = parseDate(col(r, "Date"));
      const amount = parseCurrency(col(r, "Amount"));

      if (!projectId || !date) return null;

      return {
        project_id: projectId,
        date,
        category: col(r, "Category") || null,
        cogs_code: col(r, "COGS Code", "COGS", "COGSCode") || null,
        vendor: col(r, "Vendor") || null,
        amount: amount ?? 0,
        amount_pending: parseBool(col(r, "Pending", "Amount Pending")),
        purchaser: col(r, "Purchaser") || null,
        notes: col(r, "Notes") || null,
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  console.log(`  Mapped ${expenses.length} expenses for import`);

  let imported = 0;
  for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
    const batch = expenses.slice(i, i + BATCH_SIZE);
    // Use insert (not upsert) since we let the DB auto-generate expense IDs
    const { error } = await supabase.from("expenses").insert(batch);
    if (error) {
      console.error(`  Error inserting expenses batch ${i}-${i + batch.length}:`, error.message);
    } else {
      imported += batch.length;
    }
  }

  console.log(`Imported ${imported} expenses`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== MDP CSV Import ===\n");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log("");

  await importProjects();
  console.log("");
  await importExpenses();

  console.log("\n=== Import complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
