import type { NormalizedMaterialRow, ParsedMaterialsWorkbook } from "./types.ts";

export interface MaterialImportPreviewRow {
  sheet_name: string;
  source_row_number: number;
  raw_row: Record<string, unknown>;
  parsed_row: Record<string, unknown>;
  normalized_candidate: Record<string, unknown>;
  status: "parsed" | "needs_review" | "skipped" | "imported" | "error";
  error_text: string | null;
}

export interface MaterialImportSummary {
  totalRows: number;
  bySheet: Record<string, number>;
  byStatus: Record<string, number>;
}

function candidateFromRow(row: NormalizedMaterialRow): Record<string, unknown> {
  return {
    category: row.category,
    materialName: row.materialName,
    vendorName: row.vendorName,
    dimensions: row.dimensions,
    thicknessText: row.thicknessText,
    unit: row.unit,
    price: row.price,
    link: row.link,
    packQuantity: row.packQuantity,
    notes: row.notes,
  };
}

function classifyRow(row: NormalizedMaterialRow): MaterialImportPreviewRow["status"] {
  if (!row.materialName || !row.category || row.price == null) return "needs_review";
  return "parsed";
}

export function buildImportPreviewRows(parsed: ParsedMaterialsWorkbook): MaterialImportPreviewRow[] {
  const rows: MaterialImportPreviewRow[] = [];

  for (const [sheetName, sheetRows] of Object.entries(parsed.bySheet)) {
    for (const row of sheetRows) {
      const candidate = candidateFromRow(row);
      rows.push({
        sheet_name: sheetName,
        source_row_number: row.sourceRowNumber,
        raw_row: candidate,
        parsed_row: candidate,
        normalized_candidate: candidate,
        status: classifyRow(row),
        error_text: null,
      });
    }
  }

  return rows;
}

export function summarizeImportRows(rows: MaterialImportPreviewRow[]): MaterialImportSummary {
  const bySheet: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    bySheet[row.sheet_name] = (bySheet[row.sheet_name] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }

  return {
    totalRows: rows.length,
    bySheet,
    byStatus,
  };
}
