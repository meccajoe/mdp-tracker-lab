import assert from "node:assert/strict";
import test from "node:test";
import { inferAdaSheetDraft } from "@/lib/ada-sheet-instructions";

test("Ada infers an explicit A1 sheet instruction without applying it", () => {
  assert.deepEqual(inferAdaSheetDraft("change Sheet1!F8 to 1250", 2), { rangeA1: "Sheet1!F8", values: [[1250]] });
});

test("Ada maps margin factor instruction to the canonical workbook row", () => {
  assert.deepEqual(inferAdaSheetDraft("set margin factor to 1.35", 2), { rangeA1: "Sheet1!B11", values: [[1.35]] });
});

test("Ada refuses ambiguous sheet instructions", () => {
  assert.equal(inferAdaSheetDraft("make the quote cheaper", 2), null);
});

test("Ada stages a percentage increase for a named quote line", () => {
  assert.deepEqual(inferAdaSheetDraft("raise install labor by 10%", [{ itemName: "Install labor", clientPrice: 1000 }]), { rangeA1: "Sheet1!F5", values: [[1100]] });
});

test("Ada stages a dollar add for a named quote line", () => {
  assert.deepEqual(inferAdaSheetDraft("add $500 to freight", [{ itemName: "Freight", clientPrice: 250 }]), { rangeA1: "Sheet1!F5", values: [[750]] });
});
