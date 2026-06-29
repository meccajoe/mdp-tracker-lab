import assert from "node:assert/strict";
import test from "node:test";

import { enrichImportCandidate } from "./import.ts";
import { matchMaterialCandidate } from "./match.ts";

const EXISTING_MATERIALS = [
  {
    id: "mat-1",
    canonical_name: "3/4 MDF 4x8",
    category: "Wood",
    dimensions: "4x8",
    thickness_text: "3/4",
    material_aliases: [
      { alias_text: "MDF Sheet 3/4", normalized_alias_text: "mdf sheet 3 4" },
    ],
  },
  {
    id: "mat-2",
    canonical_name: "Birch Plywood 4x8",
    category: "Wood",
    dimensions: "4x8",
    thickness_text: "3/4",
    material_aliases: [],
  },
  {
    id: "mat-3",
    canonical_name: "3/4 MDF 4x10",
    category: "Wood",
    dimensions: "4x10",
    thickness_text: "3/4",
    material_aliases: [],
  },
];

test("matchMaterialCandidate returns a high-confidence canonical match when category and dimensions align", () => {
  const result = matchMaterialCandidate(
    {
      materialName: "3/4 MDF 4x8",
      category: "Wood",
      dimensions: "4x8",
      thicknessText: "3/4",
    },
    [...EXISTING_MATERIALS]
  );

  assert.equal(result.suggested_material_id, "mat-1");
  assert.equal(result.requires_review, false);
  assert.equal(result.matched_by, "canonical");
  assert.ok(result.confidence >= 70);
});

test("matchMaterialCandidate returns an alias-based match when the alias is exact", () => {
  const result = matchMaterialCandidate(
    {
      materialName: "MDF Sheet 3/4",
      category: "Wood",
      dimensions: "4x8",
      thicknessText: "3/4",
    },
    [...EXISTING_MATERIALS]
  );

  assert.equal(result.suggested_material_id, "mat-1");
  assert.equal(result.matched_by, "alias");
  assert.equal(result.requires_review, false);
});

test("enrichImportCandidate marks low-confidence matches for review", () => {
  const enriched = enrichImportCandidate(
    {
      materialName: "3/4 MDF 4x8",
      category: "Board Goods",
      dimensions: "4x8",
      thicknessText: "3/4",
      unit: "sheet",
      price: 55,
    },
    { existingMaterials: [...EXISTING_MATERIALS] }
  );

  assert.equal(enriched.status, "needs_review");
  assert.match(enriched.error_text ?? "", /low_confidence_material_match/);
});

test("enrichImportCandidate leaves unmatched valid rows parsed as new candidates", () => {
  const enriched = enrichImportCandidate(
    {
      materialName: "Black Gator Foam 1/2",
      category: "Graphics",
      dimensions: "4x8",
      thicknessText: "1/2",
      unit: "sheet",
      price: 101,
    },
    { existingMaterials: [...EXISTING_MATERIALS] }
  );

  assert.equal(enriched.status, "parsed");
  assert.equal(enriched.normalized_candidate.match.matched_by, "new_candidate");
});

test("enrichImportCandidate marks missing required fields as needs_review", () => {
  const enriched = enrichImportCandidate(
    {
      materialName: "Some Material",
      category: null,
      dimensions: null,
      thicknessText: null,
      unit: null,
      price: null,
    },
    { existingMaterials: [...EXISTING_MATERIALS] }
  );

  assert.equal(enriched.status, "needs_review");
  assert.match(enriched.error_text ?? "", /missing_category/);
  assert.match(enriched.error_text ?? "", /missing_price/);
});
