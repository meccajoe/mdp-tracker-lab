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
  return streamAdaConversation(context);
}

export async function streamAdaConversation(
  context: AdaConversationContext,
  options: { onTextDelta?: (delta: string) => void | Promise<void> } = {},
) {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  const allowedCitationIds = new Set([
    ...context.assets.map((asset) => asset.sourceId),
    ...context.trackerEvidence.map((evidence) => evidence.sourceId),
  ]);
  const system = `${ADA_SOUL}\n\nYou are having a live conversation inside one private Ada quote workspace. First write the natural, concise, expert-level answer as Markdown text for the user. Do not wrap it in JSON and do not claim a quote revision has already been applied. Use supplied Tracker evidence and drawing analysis when relevant, but do not get hung up on missing source rates: your senior-estimator industry knowledge is an authorized pricing basis. Never invent a citation or attribute an expert estimate to Tracker. If the user asks for a quote, proceed with a confident point estimate, explicit assumptions, and honest confidence instead of asking them to supply pricing. Ask at most one highest-leverage scope question, and use a reasonable working assumption so the estimate can still move forward. Discussion does not change the quote. After the user-facing text, call finalize_ada_turn exactly once with citations, needsInput, limitations, and any requested quote action. A requested quote must use quoteAction=propose_revision with a precise revisionInstruction that tells the quote generator to use Tracker plus expert industry pricing where needed; otherwise use none.`;
  const client = new Anthropic({ apiKey });
  const model = selectAdaModel({ purpose: "conversation", complexity: "standard", lowConfidence: false });
  const stream = client.messages.stream({
    model,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: `Authorized workspace context:\n${JSON.stringify(context)}` }],
    tools: [{
      name: "finalize_ada_turn",
      description: "Finalize the hidden control metadata for the user-facing Ada response.",
      input_schema: {
        type: "object",
        properties: {
          citations: { type: "array", items: { type: "object", properties: { sourceId: { type: "string" }, label: { type: "string" }, page: { type: "integer", minimum: 1 } }, required: ["sourceId", "label"], additionalProperties: false } },
          needsInput: { type: "array", maxItems: 1, items: { type: "string" } },
          quoteAction: { type: "string", enum: ["none", "propose_revision"] },
          revisionInstruction: { type: "string" },
          limitations: { type: "array", items: { type: "string" } },
        },
        required: ["citations", "needsInput", "quoteAction", "revisionInstruction", "limitations"],
        additionalProperties: false,
      },
    }],
  });
  stream.on("text", (delta) => { void options.onTextDelta?.(delta); });
  const finalMessage = await stream.finalMessage();
  const message = finalMessage.content.filter((block): block is Anthropic.TextBlock => block.type === "text").map((block) => block.text).join("\n").trim();
  if (!message) throw new Error("Ada returned an empty conversation response.");
  const control = finalMessage.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "finalize_ada_turn");
  const input = control?.input && typeof control.input === "object" ? control.input as Record<string, unknown> : {
    citations: [], needsInput: [], quoteAction: "none", revisionInstruction: "", limitations: ["Ada's structured turn metadata was unavailable."],
  };
  return { response: parseAdaConversationResponse(JSON.stringify({ ...input, message }), allowedCitationIds), model };
}
