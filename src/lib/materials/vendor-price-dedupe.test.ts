import assert from "node:assert/strict";
import test from "node:test";

import type { MaterialImportNormalizedCandidate } from "./import.ts";
import { findExactVendorPriceDuplicate, type ExistingVendorPriceRecord } from "./vendor-price-dedupe.ts";

const CANDIDATE: MaterialImportNormalizedCandidate = {
  category: "Wood",
  materialName: "Birch Baltic",
  vendorName: "Plywood Co",
  dimensions: "4x8",
  thicknessText: "3/4",
  unit: "Unit",
  price: 108,
  link: null,
  packQuantity: null,
  notes: null,
  dedupe_key: null,
  match: {
    material_id: "mat-1",
    label: "Birch Baltic",
    matched_by: "canonical",
    confidence: 92,
    candidates: [],
  },
};

function row(overrides: Partial<ExistingVendorPriceRecord> = {}): ExistingVendorPriceRecord {
  return {
    id: overrides.id ?? "vp-1",
    vendor_id: overrides.vendor_id ?? "vendor-1",
    vendor_sku: overrides.vendor_sku ?? null,
    vendor_material_name: overrides.vendor_material_name ?? "Birch Baltic",
    vendor_dimension_text: overrides.vendor_dimension_text ?? "4x8",
    unit: overrides.unit ?? "Unit",
    pack_quantity: overrides.pack_quantity ?? null,
    price: overrides.price ?? 108,
    price_basis: overrides.price_basis ?? "Unit",
    is_current: overrides.is_current ?? false,
  };
}

test("findExactVendorPriceDuplicate matches an existing historical row even when it is not current", () => {
  const duplicate = findExactVendorPriceDuplicate([row({ id: "vp-historical", is_current: false })], CANDIDATE, "vendor-1");

  assert.equal(duplicate?.id, "vp-historical");
});

test("findExactVendorPriceDuplicate matches an existing current row too", () => {
  const duplicate = findExactVendorPriceDuplicate([row({ id: "vp-current", is_current: true })], CANDIDATE, "vendor-1");

  assert.equal(duplicate?.id, "vp-current");
});

test("findExactVendorPriceDuplicate ignores rows with a different vendor or price signature", () => {
  const duplicate = findExactVendorPriceDuplicate([
    row({ id: "vp-other-vendor", vendor_id: "vendor-2" }),
    row({ id: "vp-other-price", price: 99 }),
    row({ id: "vp-other-dimension", vendor_dimension_text: "5x10" }),
  ], CANDIDATE, "vendor-1");

  assert.equal(duplicate, null);
});
