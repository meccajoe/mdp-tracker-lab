export type AdaSheetDraft = { rangeA1: string; values: Array<Array<string | number>> };

function parseValue(raw: string): string | number {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) && value !== "" ? number : value;
}

export function inferAdaSheetDraft(instruction: string, lineItemCount: number): AdaSheetDraft | null {
  const explicit = instruction.match(/(?:change|set)\s+((?:[A-Za-z0-9_ ]+!)?[A-Z]+\d+)\s+(?:to|=)\s+(.+)/i);
  if (explicit) {
    const rangeA1 = explicit[1].includes("!") ? explicit[1] : `Sheet1!${explicit[1].toUpperCase()}`;
    return { rangeA1, values: [[parseValue(explicit[2])]] };
  }
  const marginFactor = instruction.match(/(?:change|set)\s+margin\s+factor\s+(?:to|=)\s+([0-9.,]+)/i);
  if (marginFactor) return { rangeA1: `Sheet1!B${9 + lineItemCount}`, values: [[parseValue(marginFactor[1])]] };
  return null;
}
