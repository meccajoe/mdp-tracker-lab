import type { MaterialImportNormalizedCandidate } from "./import.ts";
import { sameMaterialText } from "./match.ts";

export type ExistingVendorPriceRecord = {
  id: string;
  vendor_id: string | null;
  vendor_sku: string | null;
  vendor_material_name: string | null;
  vendor_dimension_text: string | null;
  unit: string | null;
  pack_quantity: number | null;
  price: number;
  price_basis: string | null;
  is_current: boolean;
};

export function findExactVendorPriceDuplicate(
  existingRows: ExistingVendorPriceRecord[],
  candidate: MaterialImportNormalizedCandidate,
  vendorId: string | null
) {
  return existingRows.find((row) =>
    row.vendor_id === vendorId &&
    Number(row.price).toFixed(2) === Number(candidate.price ?? 0).toFixed(2) &&
    (row.price_basis ?? null) === (candidate.unit ?? null) &&
    sameMaterialText(row.unit, candidate.unit) &&
    sameMaterialText(row.vendor_material_name, candidate.materialName) &&
    sameMaterialText(row.vendor_dimension_text, candidate.dimensions) &&
    Number(row.pack_quantity ?? 0) === Number(candidate.packQuantity ?? 0)
  ) ?? null;
}
