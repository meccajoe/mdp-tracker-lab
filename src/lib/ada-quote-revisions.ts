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

function lineFingerprint(line: AdaQuoteLine) {
  return JSON.stringify([
    line.buildItem,
    line.itemName,
    line.lineType,
    line.internalCost,
    line.clientPrice,
    line.confidence,
    line.evidenceRefs,
    line.pricingBasis,
    line.assumption ?? null,
  ]);
}

function groupedLines(lines: AdaQuoteLine[]) {
  const groups = new Map<string, AdaQuoteLine[]>();
  for (const line of lines) {
    const key = lineKey(line);
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }
  return groups;
}

function occurrenceKey(key: string, index: number, total: number) {
  return total > 1 ? `${key}::${index + 1}` : key;
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
  const previous = groupedLines(previousLines);
  const next = groupedLines(nextLines);
  const keys = new Set([...previous.keys(), ...next.keys()]);
  const added: Array<{ key: string; itemName: string; sellDelta: number; line: AdaQuoteLine }> = [];
  const removed: Array<{ key: string; itemName: string; sellDelta: number; line: AdaQuoteLine }> = [];
  const changed: Array<{ key: string; itemName: string; internalCostDelta: number; sellDelta: number; before: AdaQuoteLine; after: AdaQuoteLine }> = [];

  for (const key of keys) {
    const previousGroup = previous.get(key) ?? [];
    const nextGroup = next.get(key) ?? [];
    const pairedCount = Math.min(previousGroup.length, nextGroup.length);
    const totalOccurrences = Math.max(previousGroup.length, nextGroup.length);
    for (let index = 0; index < pairedCount; index += 1) {
      const before = previousGroup[index];
      const after = nextGroup[index];
      if (lineFingerprint(before) !== lineFingerprint(after)) {
        changed.push({
          key: occurrenceKey(key, index, totalOccurrences),
          itemName: after.itemName,
          internalCostDelta: after.internalCost - before.internalCost,
          sellDelta: after.clientPrice - before.clientPrice,
          before,
          after,
        });
      }
    }
    for (let index = pairedCount; index < nextGroup.length; index += 1) {
      const line = nextGroup[index];
      added.push({ key: occurrenceKey(key, index, totalOccurrences), itemName: line.itemName, sellDelta: line.clientPrice, line });
    }
    for (let index = pairedCount; index < previousGroup.length; index += 1) {
      const line = previousGroup[index];
      removed.push({ key: occurrenceKey(key, index, totalOccurrences), itemName: line.itemName, sellDelta: -line.clientPrice, line });
    }
  }
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
  const proposal = await generateAdaRevisionProposalFromInstruction(args);
  const { revision } = await createAdaQuoteRevision({ supabase: args.supabase, workspaceId: args.workspaceId, actorEmail: args.actorEmail, quoteValue: proposal.snapshot.quoteJson, assumptions: proposal.snapshot.assumptions, evidence: proposal.snapshot.evidence });
  return { revision, revisionDelta: proposal.proposalDelta, sourceRevisionId: proposal.sourceRevisionId };
}

export async function generateAdaRevisionProposalFromInstruction(args: {
  workspaceId: string;
  instruction: string;
  currentRevision: RevisionLike | null;
  messages: Array<{ content: string }>;
  assets: unknown[];
  intelligence: unknown[];
  generateQuote?: typeof generateAdaQuote;
}) {
  const previousLines = validatedLines(args.currentRevision?.quote_json?.lineItems ?? []);
  const generateQuote = args.generateQuote ?? generateAdaQuote;
  const quote = await generateQuote({
    messages: args.messages,
    assets: args.assets,
    intelligence: args.intelligence,
    existingQuote: args.currentRevision?.quote_json ?? undefined,
    instruction: args.instruction,
  });
  const snapshot = validateAdaQuoteSnapshot({ lineItems: quote.lineItems }, quote.assumptions, quote.evidence);
  return {
    snapshot,
    proposalDelta: buildAdaRevisionDelta(previousLines, snapshot.quoteJson.lineItems),
    sourceRevisionId: args.currentRevision?.id ?? null,
  };
}
