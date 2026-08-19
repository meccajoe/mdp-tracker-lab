import Anthropic from "@anthropic-ai/sdk";

import { selectAdaModel } from "@/lib/ada-model-policy";
import { ADA_SOUL } from "@/lib/ada-soul";

export type AdaConversationCitation = {
  sourceId: string;
  label: string;
  page?: number;
};

export type AdaConversationResponse = {
  message: string;
  citations: AdaConversationCitation[];
  needsInput: string[];
  quoteAction: "none" | "propose_revision";
  revisionInstruction?: string;
  limitations: string[];
};

export type AdaConversationContext = {
  workspace: { title: string; clientName?: string | null; contactName?: string | null; status: string };
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  activeRevision?: unknown;
  assets: Array<{ sourceId: string; label: string; mimeType: string; analysis: unknown }>;
  trackerEvidence: Array<{ sourceId: string; label: string; resource: string; rationale: string; freshness?: string | null; confidence: string; data: unknown }>;
  limitations: string[];
  selectedEvidence?: { sourceId: string; page?: number } | null;
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

export function parseAdaConversationResponse(text: string, allowedCitationIds: Set<string>): AdaConversationResponse {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Ada returned no structured conversation response.");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  if (!message) throw new Error("Ada returned an empty conversation response.");
  const citations = Array.isArray(parsed.citations) ? parsed.citations.slice(0, 8).map((item) => {
    const citation = item as Record<string, unknown>;
    const sourceId = typeof citation.sourceId === "string" ? citation.sourceId.trim() : "";
    if (!sourceId || !allowedCitationIds.has(sourceId)) throw new Error(`Ada returned an unsupported citation: ${sourceId || "missing"}.`);
    const label = typeof citation.label === "string" && citation.label.trim() ? citation.label.trim() : sourceId;
    const page = Number(citation.page);
    return { sourceId, label, ...(Number.isInteger(page) && page > 0 ? { page } : {}) };
  }) : [];
  const quoteAction = parsed.quoteAction === "propose_revision" ? "propose_revision" : "none";
  const revisionInstruction = typeof parsed.revisionInstruction === "string" && parsed.revisionInstruction.trim() ? parsed.revisionInstruction.trim() : undefined;
  if (quoteAction === "propose_revision" && !revisionInstruction) throw new Error("Ada proposed a revision without a revision instruction.");
  return {
    message,
    citations,
    needsInput: stringArray(parsed.needsInput).slice(0, 1),
    quoteAction,
    ...(revisionInstruction ? { revisionInstruction } : {}),
    limitations: stringArray(parsed.limitations),
  };
}

export async function generateAdaConversation(context: AdaConversationContext) {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  const allowedCitationIds = new Set([
    ...context.assets.map((asset) => asset.sourceId),
    ...context.trackerEvidence.map((evidence) => evidence.sourceId),
  ]);
  const system = `${ADA_SOUL}\n\nYou are having a live conversation inside one private Ada quote workspace. Respond naturally first. Be concise but expert-level. Use the supplied Tracker evidence and drawing analysis only when relevant; cite every factual recommendation that depends on those sources. Never invent a citation, price, dimension, material, or certainty. Ask at most one highest-leverage question. Discussion does not change the quote. If the user clearly requests a material quote change, set quoteAction to propose_revision and provide a precise revisionInstruction, but do not claim the revision has already been applied. Return only JSON with: {"message":"...","citations":[{"sourceId":"authorized-id","label":"...","page":1}],"needsInput":["..."],"quoteAction":"none|propose_revision","revisionInstruction":"optional","limitations":["..."]}.`;
  const client = new Anthropic({ apiKey });
  const model = selectAdaModel({ purpose: "conversation", complexity: "standard", lowConfidence: false });
  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: `Authorized workspace context:\n${JSON.stringify(context)}` }],
  });
  const text = response.content.filter((block): block is Anthropic.TextBlock => block.type === "text").map((block) => block.text).join("\n");
  return { response: parseAdaConversationResponse(text, allowedCitationIds), model };
}
