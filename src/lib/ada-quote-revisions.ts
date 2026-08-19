import { generateAdaQuote } from "@/lib/ada-quote-generation";
import { validateAdaQuoteSnapshot, type AdaQuoteLine } from "@/lib/ada-quote-validation";

export type { AdaQuoteLine } from "@/lib/ada-quote-validation";

type RevisionLike = {
  id?: string;
  revision_number: number;
  quote_json: { lineItems?: AdaQuoteLine[] } | null;
};

function lineKey(line: AdaQuoteLine) {
  return `${line.buildItem}::${line.itemName}::${line.lineType}`.trim().toLowerCase();
}

function validatedLines(lines: AdaQuoteLine[]) {
  return validateAdaQuoteSnapshot({ lineItems: lines }).quoteJson.lineItems;
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

export async function createAdaQuoteRevision(args: {
  supabase: any;
  workspaceId: string;
  actorEmail: string;
  quoteValue: unknown;
  assumptions?: unknown;
  evidence?: unknown;
}) {
  const snapshot = validateAdaQuoteSnapshot(args.quoteValue, args.assumptions, args.evidence);
  const { data, error } = await args.supabase.rpc("create_ada_quote_revision", {
    p_workspace_id: args.workspaceId,
    p_actor_email: args.actorEmail,
    p_quote_json: snapshot.quoteJson,
    p_internal_cost: snapshot.totals.internalCost,
    p_sell_price: snapshot.totals.sellPrice,
    p_margin_pct: snapshot.totals.marginPct,
    p_assumptions_json: snapshot.assumptions,
    p_evidence_json: snapshot.evidence,
  });
  if (error) throw new Error(error.message);
  const revision = Array.isArray(data) ? data[0] : data;
  if (!revision) throw new Error("Ada could not persist the quote revision.");
  return { revision, snapshot };
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
  const { revision, snapshot } = await createAdaQuoteRevision({ supabase: args.supabase, workspaceId: args.workspaceId, actorEmail: args.actorEmail, quoteValue: { lineItems: quote.lineItems }, assumptions: quote.assumptions, evidence: quote.evidence });
  const lines = snapshot.quoteJson.lineItems;
  const revisionDelta = buildAdaRevisionDelta(previousLines, lines);
  return { revision, revisionDelta, sourceRevisionId: args.currentRevision?.id ?? null };
}
