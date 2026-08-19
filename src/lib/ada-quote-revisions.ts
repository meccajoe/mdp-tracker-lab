import { generateAdaQuote, type GeneratedQuote } from "@/lib/ada-quote-generation";

export type AdaQuoteLine = GeneratedQuote["lineItems"][number];

type RevisionLike = {
  id?: string;
  revision_number: number;
  quote_json: { lineItems?: AdaQuoteLine[] } | null;
};

function lineKey(line: AdaQuoteLine) {
  return `${line.buildItem}::${line.itemName}::${line.lineType}`.trim().toLowerCase();
}

function validatedLines(lines: AdaQuoteLine[]) {
  if (!Array.isArray(lines) || lines.some((line) => !line.itemName?.trim() || !line.buildItem?.trim() || !["material", "labor"].includes(line.lineType) || !Number.isFinite(line.internalCost) || !Number.isFinite(line.clientPrice) || line.internalCost < 0 || line.clientPrice < 0)) {
    throw new Error("Ada returned invalid quote lines for this revision.");
  }
  return lines;
}

export function calculateAdaRevisionTotals(lines: AdaQuoteLine[]) {
  validatedLines(lines);
  const internalCost = lines.reduce((sum, line) => sum + line.internalCost, 0);
  const sellPrice = lines.reduce((sum, line) => sum + line.clientPrice, 0);
  return { internalCost, sellPrice, marginPct: sellPrice ? ((sellPrice - internalCost) / sellPrice) * 100 : 0 };
}

export function buildAdaRevisionDelta(previousLines: AdaQuoteLine[], nextLines: AdaQuoteLine[]) {
  const previous = new Map(previousLines.map((line) => [lineKey(line), line]));
  const next = new Map(nextLines.map((line) => [lineKey(line), line]));
  const added = [...next.entries()].filter(([key]) => !previous.has(key)).map(([key, line]) => ({ key, itemName: line.itemName, sellDelta: line.clientPrice }));
  const removed = [...previous.entries()].filter(([key]) => !next.has(key)).map(([key, line]) => ({ key, itemName: line.itemName, sellDelta: -line.clientPrice }));
  const changed = [...next.entries()].flatMap(([key, line]) => {
    const old = previous.get(key);
    if (!old || (old.internalCost === line.internalCost && old.clientPrice === line.clientPrice)) return [];
    return [{ key, itemName: line.itemName, internalCostDelta: line.internalCost - old.internalCost, sellDelta: line.clientPrice - old.clientPrice }];
  });
  const previousTotals = calculateAdaRevisionTotals(previousLines);
  const nextTotals = calculateAdaRevisionTotals(nextLines);
  return { added, removed, changed, internalCostDelta: nextTotals.internalCost - previousTotals.internalCost, sellPriceDelta: nextTotals.sellPrice - previousTotals.sellPrice };
}

export async function createAdaRevisionFromInstruction(args: {
  supabase: any;
  workspaceId: string;
  actorEmail: string;
  instruction: string;
  currentRevision: RevisionLike | null;
  messages: Array<{ content: string }>;
  assets: unknown[];
  intelligence: unknown[];
}) {
  const previousLines = validatedLines(args.currentRevision?.quote_json?.lineItems ?? []);
  const quote = await generateAdaQuote({
    messages: args.messages,
    assets: args.assets,
    intelligence: args.intelligence,
    existingQuote: args.currentRevision?.quote_json ?? undefined,
    instruction: args.instruction,
  });
  const lines = validatedLines(quote.lineItems);
  const totals = calculateAdaRevisionTotals(lines);
  const revisionNumber = (args.currentRevision?.revision_number ?? 0) + 1;
  const { data: revision, error } = await args.supabase.from("ada_quote_revisions").insert({
    workspace_id: args.workspaceId,
    revision_number: revisionNumber,
    quote_json: { lineItems: lines },
    internal_cost: totals.internalCost,
    sell_price: totals.sellPrice,
    margin_pct: totals.marginPct,
    assumptions_json: quote.assumptions,
    evidence_json: quote.evidence,
    created_by_email: args.actorEmail,
  }).select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").single();
  if (error) throw new Error(error.message);
  const revisionDelta = buildAdaRevisionDelta(previousLines, lines);
  return { revision, revisionDelta, sourceRevisionId: args.currentRevision?.id ?? null };
}
