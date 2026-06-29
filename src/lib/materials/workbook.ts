import XLSX from "xlsx";

import {
  normalizeGraphicsRows,
  normalizeMaterialDatabaseRows,
  normalizeMetalAluminumRows,
  normalizePackagingRows,
  normalizeWoodRows,
} from "./normalize.ts";
import { MATERIAL_SHEET_NAMES, type MaterialSheetName, type ParsedMaterialsWorkbook } from "./types.ts";

const NORMALIZERS: Record<MaterialSheetName, (rows: unknown[][]) => ParsedMaterialsWorkbook["bySheet"][MaterialSheetName]> = {
  "MATERIAL DATA BASE": normalizeMaterialDatabaseRows,
  Wood: normalizeWoodRows,
  MetalAluminum: normalizeMetalAluminumRows,
  Graphics: normalizeGraphicsRows,
  "Packaging Material": normalizePackagingRows,
};

export function parseMaterialsWorkbook(filePath: string): ParsedMaterialsWorkbook {
  const workbook = XLSX.readFile(filePath, { cellDates: true });

  const bySheet: ParsedMaterialsWorkbook["bySheet"] = {
    "MATERIAL DATA BASE": [],
    Wood: [],
    MetalAluminum: [],
    Graphics: [],
    "Packaging Material": [],
  };

  for (const sheetName of MATERIAL_SHEET_NAMES) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];

    bySheet[sheetName] = NORMALIZERS[sheetName](rows);
  }

  const totalRows = Object.values(bySheet).reduce((sum, rows) => sum + rows.length, 0);

  return {
    bySheet,
    totalRows,
  };
}
