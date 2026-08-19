export type AdaSheetDraft = { rangeA1: string; values: Array<Array<string | number>> };
type QuoteLine = { itemName: string; clientPrice: number };

function parseValue(raw: string): string | number {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) && value !== "" ? number : value;
}

function normalise(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }

export function inferAdaSheetDraft(instruction: string, context: number | QuoteLine[]): AdaSheetDraft | null {
  const lines = Array.isArray(context) ? context : [];
  const lineItemCount = Array.isArray(context) ? context.length : context;
  const explicit = instruction.match(/(?:change|set)\s+((?:[A-Za-z0-9_ ]+!)?[A-Z]+\d+)\s+(?:to|=)\s+(.+)/i);
  if (explicit) {
    const rangeA1 = explicit[1].includes("!") ? explicit[1] : `Sheet1!${explicit[1].toUpperCase()}`;
    return { rangeA1, values: [[parseValue(explicit[2])]] };
  }
  const marginFactor = instruction.match(/(?:change|set)\s+margin\s+factor\s+(?:to|=)\s+([0-9.,]+)/i);
  if (marginFactor) return { rangeA1: `Sheet1!B${9 + lineItemCount}`, values: [[parseValue(marginFactor[1])]] };
  const additional = instruction.match(/add\s+additional\s+item\s+(.+?)\s+cost\s+\$?([0-9,.]+)\s+sell\s+\$?([0-9,.]+)/i);
  if (additional) {
    const internalCost = Number(additional[2].replace(/,/g, "")); const sellPrice = Number(additional[3].replace(/,/g, ""));
    if (internalCost >= 0 && sellPrice > 0) return { rangeA1: `Sheet1!A${12 + lineItemCount}:G${12 + lineItemCount}`, values: [[additional[1].trim(), "other", 1, "ea", internalCost, sellPrice, Math.round(((sellPrice - internalCost) / sellPrice) * 10000) / 10000]] };
  }
  const percent = instruction.match(/(?:raise|increase)\s+(.+?)\s+by\s+([0-9.]+)%/i);
  if (percent) {
    const index = lines.findIndex((line) => normalise(line.itemName) === normalise(percent[1]));
    if (index >= 0) return { rangeA1: `Sheet1!F${5 + index}`, values: [[Math.round(lines[index].clientPrice * (1 + Number(percent[2]) / 100) * 100) / 100]] };
  }
  const add = instruction.match(/add\s+\$?([0-9,.]+)\s+to\s+(.+)/i);
  if (add) {
    const index = lines.findIndex((line) => normalise(line.itemName) === normalise(add[2]));
    if (index >= 0) return { rangeA1: `Sheet1!F${5 + index}`, values: [[Math.round((lines[index].clientPrice + Number(add[1].replace(/,/g, ""))) * 100) / 100]] };
  }
  return null;
}
