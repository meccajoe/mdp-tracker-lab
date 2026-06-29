import type { MaterialSheetName, NormalizedMaterialRow } from "./types.ts";

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function asTrimmedString(value: unknown): string | null {
  if (isBlank(value)) return null;
  if (value instanceof Date) {
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return `${month}/${day}`;
  }
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildRow(
  sheetName: MaterialSheetName,
  sourceRowNumber: number,
  values: Partial<NormalizedMaterialRow>
): NormalizedMaterialRow {
  return {
    sheetName,
    sourceRowNumber,
    category: values.category ?? null,
    materialName: values.materialName ?? null,
    vendorName: values.vendorName ?? null,
    dimensions: values.dimensions ?? null,
    thicknessText: values.thicknessText ?? null,
    unit: values.unit ?? null,
    price: values.price ?? null,
    link: values.link ?? null,
    packQuantity: values.packQuantity ?? null,
    notes: values.notes ?? null,
  };
}

function isSummaryCategoryRow(row: unknown[]): boolean {
  return !isBlank(row[0]) && row.slice(1, 5).every(isBlank);
}

function isMaterialDatabaseHeaderRow(row: unknown[]): boolean {
  return asTrimmedString(row[0]) === "Material" && asTrimmedString(row[1]) === "Code/size";
}

function isMetalHeaderRow(row: unknown[]): boolean {
  return asTrimmedString(row[1]) === "Material" && asTrimmedString(row[2]) === "Dimension";
}

function isWoodHeaderRow(row: unknown[]): boolean {
  return asTrimmedString(row[1]) === "Material" && asTrimmedString(row[2]) === "Dimensions";
}

function isPackagingHeaderRow(row: unknown[]): boolean {
  return asTrimmedString(row[0]) === "Material" && asTrimmedString(row[1]) === "Vendor";
}

function normalizeThickness(value: unknown): string | null {
  if (value instanceof Date) {
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return `${month}/${day}`;
  }
  return asTrimmedString(value);
}

function joinNotes(values: unknown[]): string | null {
  const parts = values.map(asTrimmedString).filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" | ") : null;
}

export function normalizeMaterialDatabaseRows(rows: unknown[][]): NormalizedMaterialRow[] {
  const normalized: NormalizedMaterialRow[] = [];
  let currentCategory: string | null = null;

  rows.forEach((row, index) => {
    if (!row.some((cell) => !isBlank(cell))) return;
    if (index === 0 && asTrimmedString(row[0]) === "e") return;
    if (isMaterialDatabaseHeaderRow(row)) return;

    if (isSummaryCategoryRow(row)) {
      currentCategory = asTrimmedString(row[0]);
      return;
    }

    const materialName = asTrimmedString(row[0]);
    const price = asNumber(row[3]);
    if (!materialName || price === null) return;

    normalized.push(
      buildRow("MATERIAL DATA BASE", index + 1, {
        category: currentCategory,
        materialName,
        dimensions: asTrimmedString(row[1]),
        unit: asTrimmedString(row[2]),
        price,
        link: asTrimmedString(row[4]),
      })
    );
  });

  return normalized;
}

export function normalizeWoodRows(rows: unknown[][]): NormalizedMaterialRow[] {
  const normalized: NormalizedMaterialRow[] = [];

  rows.forEach((row, index) => {
    if (!row.some((cell) => !isBlank(cell))) return;
    if (isWoodHeaderRow(row)) return;

    const leftVendorName = asTrimmedString(row[0]);
    const leftMaterialName = asTrimmedString(row[1]);
    const leftPrice = asNumber(row[4]);
    if (leftVendorName && leftMaterialName && leftPrice !== null) {
      normalized.push(
        buildRow("Wood", index + 1, {
          category: "Wood",
          vendorName: leftVendorName,
          materialName: leftMaterialName,
          dimensions: asTrimmedString(row[2]),
          thicknessText: normalizeThickness(row[3]),
          price: leftPrice,
          notes: joinNotes(row.slice(5, 8)),
        })
      );
    }

    const rightVendorName = asTrimmedString(row[8]);
    const rightMaterialName = asTrimmedString(row[9]);
    const rightPrice = asNumber(row[11]);
    if (rightVendorName && rightMaterialName && rightPrice !== null) {
      normalized.push(
        buildRow("Wood", index + 1, {
          category: "Wood",
          vendorName: rightVendorName,
          materialName: rightMaterialName,
          dimensions: asTrimmedString(row[10]),
          price: rightPrice,
          notes: joinNotes(row.slice(12)),
        })
      );
    }
  });

  return normalized;
}

export function normalizeMetalAluminumRows(rows: unknown[][]): NormalizedMaterialRow[] {
  const normalized: NormalizedMaterialRow[] = [];

  rows.forEach((row, index) => {
    if (!row.some((cell) => !isBlank(cell))) return;
    if (isMetalHeaderRow(row)) return;

    const vendorName = asTrimmedString(row[0]);
    const materialName = asTrimmedString(row[1]);
    const price = asNumber(row[3]);
    if (!vendorName || !materialName || price === null) return;

    normalized.push(
      buildRow("MetalAluminum", index + 1, {
        category: "Metal/Aluminum",
        vendorName,
        materialName,
        dimensions: asTrimmedString(row[2]),
        unit: asTrimmedString(row[4]),
        price,
      })
    );
  });

  return normalized;
}

export function normalizeGraphicsRows(rows: unknown[][]): NormalizedMaterialRow[] {
  const normalized: NormalizedMaterialRow[] = [];

  rows.forEach((row, index) => {
    const leftVendor = asTrimmedString(row[0]);
    const leftMaterial = asTrimmedString(row[1]);
    const leftPrice = asNumber(row[2]);
    if (leftVendor && leftMaterial && leftPrice !== null) {
      normalized.push(
        buildRow("Graphics", index + 1, {
          category: "Graphics",
          vendorName: leftVendor,
          materialName: leftMaterial,
          price: leftPrice,
        })
      );
    }

    const rightVendor = asTrimmedString(row[4]);
    const rightMaterial = asTrimmedString(row[5]);
    const rightPrice = asNumber(row[6]);
    if (rightVendor && rightMaterial && rightPrice !== null) {
      normalized.push(
        buildRow("Graphics", index + 1, {
          category: "Graphics",
          vendorName: rightVendor,
          materialName: rightMaterial,
          price: rightPrice,
        })
      );
    }
  });

  return normalized;
}

export function normalizePackagingRows(rows: unknown[][]): NormalizedMaterialRow[] {
  const normalized: NormalizedMaterialRow[] = [];
  let currentMaterialName: string | null = null;

  rows.forEach((row, index) => {
    if (!row.some((cell) => !isBlank(cell))) return;
    if (isPackagingHeaderRow(row)) return;

    const maybeMaterial = asTrimmedString(row[0]);
    if (maybeMaterial) currentMaterialName = maybeMaterial;

    const vendorName = asTrimmedString(row[1]);
    const price = asNumber(row[4]);
    if (!currentMaterialName || !vendorName || price === null) return;

    normalized.push(
      buildRow("Packaging Material", index + 1, {
        category: "Packaging Material",
        materialName: currentMaterialName,
        vendorName,
        dimensions: asTrimmedString(row[2]),
        packQuantity: asNumber(row[3]),
        price,
        unit: "roll",
      })
    );
  });

  return normalized;
}
