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

    const filePath = join(dir, "materials.xlsx");
    XLSX.writeFile(workbook, filePath);

    const parsed = parseMaterialsWorkbook(filePath);

    assert.equal(parsed.totalRows, 3);
    assert.equal(parsed.bySheet["MATERIAL DATA BASE"].length, 1);
    assert.equal(parsed.bySheet.Graphics.length, 2);
    assert.equal(parsed.bySheet["MATERIAL DATA BASE"][0].category, "Pine");
    assert.equal(parsed.bySheet.Graphics[1].vendorName, "Reece Supply");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
