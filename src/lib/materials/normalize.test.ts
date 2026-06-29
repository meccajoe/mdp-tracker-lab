import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeGraphicsRows,
  normalizeMaterialDatabaseRows,
  normalizeMetalAluminumRows,
  normalizePackagingRows,
  normalizeWoodRows,
} from "./normalize.ts";

test("normalizeMaterialDatabaseRows carries category headings into subsequent item rows", () => {
  const rows = [
    ["e"],
    ["Material", "Code/size", "Format", "Price", "Link"],
    ["Pine", null, null, null, null],
    ["3/4'' Knotty pine", "4'x8'", "Unit", 108, "https://example.com/pine"],
    ["1/2'' Knotty pine", "4'x8'", "Unit", 96, null],
  ];

  const normalized = normalizeMaterialDatabaseRows(rows);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].category, "Pine");
  assert.equal(normalized[0].materialName, "3/4'' Knotty pine");
  assert.equal(normalized[0].dimensions, "4'x8'");
  assert.equal(normalized[0].unit, "Unit");
  assert.equal(normalized[0].price, 108);
  assert.equal(normalized[0].link, "https://example.com/pine");
  assert.equal(normalized[0].sourceRowNumber, 4);
});

test("normalizeWoodRows repairs date-coerced thickness fractions and folds extra note columns into notes", () => {
  const rows = [
    [null, null, "Material", "Dimensions", "Thickness", "Price", null, null, null, null, null, null, null],
    [null, "Plywood Co", "Birch Baltic", "5x5", new Date("2023-01-02T00:00:00Z"), 55.15, null, null, null, "Home Depot", "Wooden dowel", '1"', 4.66],
  ];

  const normalized = normalizeWoodRows(rows);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].vendorName, "Plywood Co");
  assert.equal(normalized[0].materialName, "Birch Baltic");
  assert.equal(normalized[0].dimensions, "5x5");
  assert.equal(normalized[0].thicknessText, "1/2");
  assert.equal(normalized[0].price, 55.15);
  assert.match(normalized[0].notes ?? "", /Home Depot/);
  assert.match(normalized[0].notes ?? "", /Wooden dowel/);
  assert.match(normalized[0].notes ?? "", /4.66/);
});

test("normalizeMetalAluminumRows skips repeated header rows inside the sheet", () => {
  const rows = [
    [null, null, "Material", "Dimension", "Price"],
    [null, "Astro Sheet Metal", "Aluminum U-Channel", "1x1x.625", 19.7],
    [null, null, "Material", "Dimension", "Price"],
    [null, "Dimco Steel", "Round Tubing", '1"x14gauge', 132],
  ];

  const normalized = normalizeMetalAluminumRows(rows);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].vendorName, "Astro Sheet Metal");
  assert.equal(normalized[1].vendorName, "Dimco Steel");
  assert.equal(normalized[1].materialName, "Round Tubing");
});

test("normalizeGraphicsRows explodes left and right side-by-side lists into separate rows", () => {
  const rows = [
    [null, null, null, null, null, null, null],
    ["Glantz", '54" X 50Y DPF 8200X', 552.8, null, "Reece Supply", "42-228SP MATTHEWS", 182.45],
  ];

  const normalized = normalizeGraphicsRows(rows);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].vendorName, "Glantz");
  assert.equal(normalized[0].materialName, '54" X 50Y DPF 8200X');
  assert.equal(normalized[0].price, 552.8);
  assert.equal(normalized[1].vendorName, "Reece Supply");
  assert.equal(normalized[1].materialName, "42-228SP MATTHEWS");
  assert.equal(normalized[1].price, 182.45);
});

test("normalizePackagingRows inherits the most recent material group when vendor rows leave it blank", () => {
  const rows = [
    [null, "Material", "Vendor", "Dimension", "Roll per Case", "Price Per Roll"],
    [null, "Double Sided Carpet Tape", "Brons", '2"x36yds', 24, 8.49],
    [null, null, "HBM Supply", '2"x25yds', 24, 6.5],
  ];

  const normalized = normalizePackagingRows(rows);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].materialName, "Double Sided Carpet Tape");
  assert.equal(normalized[1].materialName, "Double Sided Carpet Tape");
  assert.equal(normalized[1].vendorName, "HBM Supply");
  assert.equal(normalized[1].packQuantity, 24);
  assert.equal(normalized[1].price, 6.5);
});
