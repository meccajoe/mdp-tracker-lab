export type AdaQuoteLine = {
  itemName: string;
  buildItem: string;
  lineType: "material" | "labor";
  internalCost: number;
  clientPrice: number;
  confidence: "high" | "medium" | "low";
  evidenceRefs: string[];
  assumption?: string;
};

export type AdaQuoteSnapshot = {
  lineItems: AdaQuoteLine[];
};

function validateLine(value: unknown): AdaQuoteLine {
  const line = value as Partial<AdaQuoteLine> | null;
  const valid = line
    && typeof line.itemName === "string" && Boolean(line.itemName.trim())
    && typeof line.buildItem === "string" && Boolean(line.buildItem.trim())
    && (line.lineType === "material" || line.lineType === "labor")
    && typeof line.internalCost === "number" && Number.isFinite(line.internalCost) && line.internalCost >= 0
    && typeof line.clientPrice === "number" && Number.isFinite(line.clientPrice) && line.clientPrice >= 0
    && (line.confidence === "high" || line.confidence === "medium" || line.confidence === "low")
    && Array.isArray(line.evidenceRefs) && line.evidenceRefs.every((reference) => typeof reference === "string");
  if (!valid) throw new Error("Ada received an invalid quote line.");
  return {
    itemName: line.itemName!.trim(),
    buildItem: line.buildItem!.trim(),
    lineType: line.lineType!,
    internalCost: line.internalCost!,
    clientPrice: line.clientPrice!,
    confidence: line.confidence!,
    evidenceRefs: line.evidenceRefs!.map((reference) => reference.trim()).filter(Boolean),
    ...(typeof line.assumption === "string" && line.assumption.trim() ? { assumption: line.assumption.trim() } : {}),
  };
}

export function validateAdaQuoteSnapshot(quoteValue: unknown, assumptionValue: unknown = [], evidenceValue: unknown = []) {
  const quote = quoteValue as { lineItems?: unknown } | null;
  if (!quote || !Array.isArray(quote.lineItems)) throw new Error("Ada received an invalid quote structure.");
  const lineItems = quote.lineItems.map(validateLine);
  const internalCost = lineItems.reduce((sum, line) => sum + line.internalCost, 0);
  const sellPrice = lineItems.reduce((sum, line) => sum + line.clientPrice, 0);
  const assumptions = Array.isArray(assumptionValue) ? assumptionValue.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean) : [];
  const evidence = Array.isArray(evidenceValue) ? evidenceValue : [];
  return {
    quoteJson: { lineItems } satisfies AdaQuoteSnapshot,
    assumptions,
    evidence,
    totals: { internalCost, sellPrice, marginPct: sellPrice ? ((sellPrice - internalCost) / sellPrice) * 100 : 0 },
  };
}
