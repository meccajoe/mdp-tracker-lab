export const MATERIAL_SHEET_NAMES = [
  "MATERIAL DATA BASE",
  "Wood",
  "MetalAluminum",
  "Graphics",
  "Packaging Material",
] as const;

export type MaterialSheetName = (typeof MATERIAL_SHEET_NAMES)[number];

export interface NormalizedMaterialRow {
  sheetName: MaterialSheetName;
  sourceRowNumber: number;
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
}

export interface ParsedMaterialsWorkbook {
  bySheet: Record<MaterialSheetName, NormalizedMaterialRow[]>;
  totalRows: number;
}
