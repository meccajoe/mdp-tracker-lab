import * as XLSX from "xlsx";

type QuoteLine = { itemName: string; lineType: string; internalCost: number; clientPrice: number };
type QuoteRevision = { revision_number: number; internal_cost: number; sell_price: number; margin_pct: number; assumptions_json: string[]; quote_json: { lineItems?: QuoteLine[] } };

const money = "$#,##0.00";

export function buildAdaQuoteWorkbook(revision: QuoteRevision, title: string) {
  const workbook = XLSX.utils.book_new();
  const rows = quoteRevisionToSheetValues(revision, title);
  const lines = revision.quote_json.lineItems ?? [];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  for (const address of ["E5", "F5", "F" + (5 + lines.length), "F" + (6 + lines.length)]) if (sheet[address]) sheet[address].z = money;
  XLSX.utils.book_append_sheet(workbook, sheet, "Quote");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
}

export function quoteRevisionToSheetValues(revision: QuoteRevision, title: string): Array<Array<string | number>> {
  const lines = revision.quote_json.lineItems ?? [];
  const internalCostRow = 6 + lines.length;
  const sellPriceRow = internalCostRow + 1;
  return [
    ["Ada Quote", title],
    ["Revision", revision.revision_number],
    [],
    ["Item", "Type", "Qty", "Unit", "Internal Cost", "Sell Price", "Margin"],
    ...lines.map((line) => [line.itemName, line.lineType, 1, "ea", line.internalCost, line.clientPrice, line.clientPrice ? (line.clientPrice - line.internalCost) / line.clientPrice : 0]),
    [],
    ["Internal Cost", "", "", "", "", `=SUM(E5:E${4 + lines.length})`],
    ["Sell Price", "", "", "", "", `=SUM(F5:F${4 + lines.length})`],
    ["Margin", "", "", "", "", `=IF(F${sellPriceRow}=0,0,(F${sellPriceRow}-F${internalCostRow})/F${sellPriceRow})`],
    ["Margin Factor", 1],
    [],
    ["Additional Items", "Type", "Qty", "Unit", "Internal Cost", "Sell Price", "Margin"],
  ];
}
