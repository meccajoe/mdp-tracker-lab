import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import * as XLSX from "xlsx";

import { parseMaterialsWorkbook } from "./workbook.ts";

test("parseMaterialsWorkbook parses known material sheets and returns normalized rows by sheet", () => {
  const dir = mkdtempSync(join(tmpdir(), "materials-workbook-"));

  try {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["e"],
        ["Material", "Code/size", "Format", "Price", "Link"],
        ["Pine"],
        ["3/4'' Knotty pine", "4'x8'", "Unit", 108, "https://example.com/pine"],
      ]),
      "MATERIAL DATA BASE"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [null, null, null, null, null, null, null],
        ["Glantz", '54" X 50Y DPF 8200X', 552.8, null, "Reece Supply", "42-228SP MATTHEWS", 182.45],
      ]),
      "Graphics"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [null, "Material", "Dimensions", "Thickness", "Price"],
        ["Plywood Co", "Birch Baltic", "5x5", new Date("2023-01-02T00:00:00Z"), 55.15, null, null, null, "Home Depot", "Wooden dowel", '1"', 4.66],
      ]),
      "Wood"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [null, "Material", "Dimension", "Price"],
        ["Astro Sheet Metal", "Aluminum U-Channel", "1x1x.625", 19.7, "Each"],
      ]),
      "MetalAluminum"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Material", "Vendor", "Dimension", "Roll per Case", "Price Per Roll"],
        ["Double Sided Carpet Tape", "Brons", '2"x36yds', 24, 8.49],
        [null, "HBM Supply", '2"x25yds', 24, 6.5],
      ]),
      "Packaging Material"
    );

    const filePath = join(dir, "materials.xlsx");
    XLSX.writeFile(workbook, filePath);

    const parsed = parseMaterialsWorkbook(filePath);

    assert.equal(parsed.totalRows, 8);
    assert.equal(parsed.bySheet["MATERIAL DATA BASE"].length, 1);
    assert.equal(parsed.bySheet.Wood.length, 2);
    assert.equal(parsed.bySheet.MetalAluminum.length, 1);
    assert.equal(parsed.bySheet.Graphics.length, 2);
    assert.equal(parsed.bySheet["Packaging Material"].length, 2);
    assert.equal(parsed.bySheet["MATERIAL DATA BASE"][0].category, "Pine");
    assert.equal(parsed.bySheet.Wood[0].thicknessText, "1/2");
    assert.equal(parsed.bySheet.Graphics[1].vendorName, "Reece Supply");
    assert.equal(parsed.bySheet["Packaging Material"][1].materialName, "Double Sided Carpet Tape");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
