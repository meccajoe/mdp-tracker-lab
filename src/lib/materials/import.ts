import type { NormalizedMaterialRow, ParsedMaterialsWorkbook } from "./types.ts";
import { matchMaterialCandidate, type MaterialMatchRecord } from "./match.ts";

export type MaterialImportStatus = "parsed" | "needs_review" | "skipped" | "imported" | "error";

export interface MaterialImportMatchSnapshot {
  material_id: string | null;
  label: string | null;
  matched_by: "canonical" | "alias" | "new_candidate" | "ambiguous";
  confidence: number;
  candidates: Array<{
    material_id: string;
    label: string;
    matched_by: "canonical" | "alias";
    confidence: number;
    alias_text?: string | null;
  }>;
}

export interface MaterialImportNormalizedCandidate {
  category: string | null;
  materialName: string | null;
  vendorName: string | null;
  dimensions: string | null;
  thicknessText: string | null;
  unit: string | null;
  price: number | null;
  link: string | null;
  packQuantity: number | null;
  notes: string | null;
  dedupe_key: string | null;
  match: MaterialImportMatchSnapshot;
}

export interface MaterialImportPreviewRow {
  id?: string;
  sheet_name: string;
  source_row_number: number;
  raw_row: Record<string, unknown>;
  parsed_row: Record<string, unknown>;
  normalized_candidate: MaterialImportNormalizedCandidate;
  status: MaterialImportStatus;
  error_text: string | null;
  review_reasons: string[];
}

export interface MaterialImportSummary {
  totalRows: number;
  bySheet: Record<string, number>;
  byStatus: Record<string, number>;
  byReason: Record<string, number>;
}

export interface MaterialImportPreviewOptions {
  existingMaterials?: MaterialMatchRecord[];
}

function candidateFromRow(row: NormalizedMaterialRow) {
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

function buildDedupeKey(candidate: Record<string, unknown>): string | null {
  const materialName = String(candidate.materialName ?? "").trim().toLowerCase();
  const vendorName = String(candidate.vendorName ?? "").trim().toLowerCase();
  const dimensions = String(candidate.dimensions ?? "").trim().toLowerCase();
  const thicknessText = String(candidate.thicknessText ?? "").trim().toLowerCase();
  const unit = String(candidate.unit ?? "").trim().toLowerCase();
  const price = candidate.price != null ? Number(candidate.price).toFixed(2) : "";

  const fingerprint = [materialName, vendorName, dimensions, thicknessText, unit, price]
    .filter(Boolean)
    .join("|");

  return fingerprint || null;
}

function validateCandidate(candidate: Record<string, unknown>) {
  const reasons: string[] = [];

  if (!candidate.materialName) reasons.push("missing_material_name");
  if (!candidate.category) reasons.push("missing_category");
  if (candidate.price == null || Number.isNaN(Number(candidate.price))) reasons.push("missing_price");

  return reasons;
}

export function enrichImportCandidate(
  candidate: Record<string, unknown>,
  options: MaterialImportPreviewOptions = {}
): Pick<MaterialImportPreviewRow, "normalized_candidate" | "status" | "error_text" | "review_reasons"> {
  const reviewReasons = validateCandidate(candidate);
  const match = matchMaterialCandidate(
    {
      materialName: typeof candidate.materialName === "string" ? candidate.materialName : null,
      category: typeof candidate.category === "string" ? candidate.category : null,
      dimensions: typeof candidate.dimensions === "string" ? candidate.dimensions : null,
      thicknessText: typeof candidate.thicknessText === "string" ? candidate.thicknessText : null,
    },
    options.existingMaterials ?? []
  );

  if (reviewReasons.length === 0 && match.requires_review) {
    reviewReasons.push(...match.review_reasons);
  }

  const status: MaterialImportStatus = reviewReasons.length > 0 ? "needs_review" : "parsed";
  const normalizedCandidate: MaterialImportNormalizedCandidate = {
    category: typeof candidate.category === "string" ? candidate.category : null,
    materialName: typeof candidate.materialName === "string" ? candidate.materialName : null,
    vendorName: typeof candidate.vendorName === "string" ? candidate.vendorName : null,
    dimensions: typeof candidate.dimensions === "string" ? candidate.dimensions : null,
    thicknessText: typeof candidate.thicknessText === "string" ? candidate.thicknessText : null,
    unit: typeof candidate.unit === "string" ? candidate.unit : null,
    price: candidate.price == null ? null : Number(candidate.price),
    link: typeof candidate.link === "string" ? candidate.link : null,
    packQuantity: candidate.packQuantity == null ? null : Number(candidate.packQuantity),
    notes: typeof candidate.notes === "string" ? candidate.notes : null,
    dedupe_key: buildDedupeKey(candidate),
    match: {
      material_id: match.suggested_material_id,
      label: match.suggested_material_label,
      matched_by: match.matched_by,
      confidence: match.confidence,
      candidates: match.candidates,
    },
  };

  return {
    normalized_candidate: normalizedCandidate,
    status,
    error_text: reviewReasons.length > 0 ? reviewReasons.join(", ") : null,
    review_reasons: reviewReasons,
  };
}

export function buildPreviewRowFromCandidate(
  sheetName: string,
  sourceRowNumber: number,
  candidate: Record<string, unknown>,
  options: MaterialImportPreviewOptions = {}
): MaterialImportPreviewRow {
  const enriched = enrichImportCandidate(candidate, options);

  return {
    sheet_name: sheetName,
    source_row_number: sourceRowNumber,
    raw_row: candidate,
    parsed_row: candidate,
    normalized_candidate: enriched.normalized_candidate,
    status: enriched.status,
    error_text: enriched.error_text,
    review_reasons: enriched.review_reasons,
  };
}

export function buildImportPreviewRows(
  parsed: ParsedMaterialsWorkbook,
  options: MaterialImportPreviewOptions = {}
): MaterialImportPreviewRow[] {
  const rows: MaterialImportPreviewRow[] = [];

  for (const [sheetName, sheetRows] of Object.entries(parsed.bySheet)) {
    for (const row of sheetRows) {
      const candidate = candidateFromRow(row);
      rows.push(buildPreviewRowFromCandidate(sheetName, row.sourceRowNumber, candidate, options));
    }
  }

  return rows;
}

export function summarizeImportRows(rows: MaterialImportPreviewRow[]): MaterialImportSummary {
  const bySheet: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byReason: Record<string, number> = {};

  for (const row of rows) {
    bySheet[row.sheet_name] = (bySheet[row.sheet_name] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    for (const reason of row.review_reasons ?? []) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
  }

  return {
    totalRows: rows.length,
    bySheet,
    byStatus,
    byReason,
  };
}
