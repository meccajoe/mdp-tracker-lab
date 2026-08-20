import Anthropic from "@anthropic-ai/sdk";

import { selectAdaModel } from "@/lib/ada-model-policy";
import { ADA_SOUL } from "@/lib/ada-soul";

export type GeneratedQuote = {
  lineItems: Array<{
    itemName: string;
    buildItem: string;
    lineType: "material" | "labor";
    internalCost: number;
    clientPrice: number;
    confidence: "high" | "medium" | "low";
    evidenceRefs: string[];
    pricingBasis: "user_input" | "tracker_evidence" | "expert_estimate" | "blended";
    assumption?: string;
  }>;
  assumptions: string[];
  evidence: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseGeneratedQuote(input: unknown): GeneratedQuote {
  if (!isRecord(input) || !Array.isArray(input.lineItems) || input.lineItems.length === 0) throw new Error("Ada returned an invalid quote structure.");
  const lineItems = input.lineItems.map((value) => {
    if (!isRecord(value)) throw new Error("Ada returned an invalid quote structure.");
    const lineType = value.lineType;
    const confidence = value.confidence;
    const pricingBasis = value.pricingBasis;
    const assumption = typeof value.assumption === "string" ? value.assumption.trim() : undefined;
    if (
      typeof value.itemName !== "string" || !value.itemName.trim()
      || typeof value.buildItem !== "string" || !value.buildItem.trim()
      || (lineType !== "material" && lineType !== "labor")
      || (confidence !== "high" && confidence !== "medium" && confidence !== "low")
      || (pricingBasis !== "user_input" && pricingBasis !== "tracker_evidence" && pricingBasis !== "expert_estimate" && pricingBasis !== "blended")
      || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((reference) => typeof reference !== "string")
      || typeof value.internalCost !== "number" || !Number.isFinite(value.internalCost) || value.internalCost < 0
      || typeof value.clientPrice !== "number" || !Number.isFinite(value.clientPrice) || value.clientPrice < 0
      || ((pricingBasis === "expert_estimate" || pricingBasis === "blended") && !assumption)
    ) throw new Error("Ada returned an invalid quote structure.");
    const parsedLine: GeneratedQuote["lineItems"][number] = {
      itemName: value.itemName.trim(),
      buildItem: value.buildItem.trim(),
      lineType: lineType as "material" | "labor",
      internalCost: value.internalCost,
      clientPrice: value.clientPrice,
      confidence: confidence as "high" | "medium" | "low",
      evidenceRefs: value.evidenceRefs as string[],
      pricingBasis: pricingBasis as GeneratedQuote["lineItems"][number]["pricingBasis"],
      ...(assumption ? { assumption } : {}),
    };
    return parsedLine;
  });
  return {
    lineItems,
    assumptions: Array.isArray(input.assumptions) ? input.assumptions.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
  };
}

const quoteTool: Anthropic.Tool = {
  name: "finalize_ada_quote",
  description: "Return the complete validated quote after applying Ada's expert estimating judgment.",
  input_schema: {
    type: "object",
    properties: {
      lineItems: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            itemName: { type: "string" },
            buildItem: { type: "string" },
            lineType: { type: "string", enum: ["material", "labor"] },
            internalCost: { type: "number", minimum: 0 },
            clientPrice: { type: "number", minimum: 0 },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            evidenceRefs: { type: "array", items: { type: "string" } },
            pricingBasis: { type: "string", enum: ["user_input", "tracker_evidence", "expert_estimate", "blended"] },
            assumption: { type: "string" },
          },
          required: ["itemName", "buildItem", "lineType", "internalCost", "clientPrice", "confidence", "evidenceRefs", "pricingBasis", "assumption"],
          additionalProperties: false,
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
      evidence: { type: "array", items: { type: "object", additionalProperties: true } },
    },
    required: ["lineItems", "assumptions", "evidence"],
    additionalProperties: false,
  },
};

export async function generateAdaQuote(args: { messages: Array<{ content: string }>; assets: unknown[]; intelligence: unknown[]; existingQuote?: unknown; instruction?: string }) {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  const model = selectAdaModel({ purpose: "quote", complexity: "standard", lowConfidence: false });
  const system = `${ADA_SOUL}\n\nCreate or revise a complete, reviewable Mecca quote from the supplied context. If an existing quote and instruction are supplied, preserve unrelated lines and apply only the requested correction. Call finalize_ada_quote exactly once with the complete result. Group related material and labor under the same buildItem.

Pricing hierarchy: (1) explicit current user inputs, (2) relevant authorized Tracker evidence such as project_pricing_index and quote_line_items, (3) your Opus-level industry knowledge and expert judgment, or (4) a clearly labeled blend. Only prices stated directly by a user count as user_input. Prior assistant/Ada estimates remain expert_estimate; never relabel Ada's prior estimate as user input or describe it as client-supplied pricing. Sparse Tracker data is not a reason to refuse. When exact rates are absent, derive reasonable quantities, market-aware material costs, fabrication productivity and labor rates, packing/freight/install allowances, and client pricing appropriate to the stated geography, timing, complexity, and risk. Deliver a single best point estimate suitable for Paul to review. Never return zero or pending pricing merely because a source rate is missing. Use assumptions, confidence, and prudent allowance/contingency lines where an experienced estimator would.

Use evidenceRefs only for actual supplied asset/resource IDs, using asset:<asset-id>:page:<page-number> for an exact PDF page and resource:<resource-id> for Tracker evidence. Never fabricate a source or label expert knowledge as Tracker evidence. Every expert_estimate or blended line must include a concise assumption explaining its pricing basis; include structured expert-estimate records in evidence where useful.`;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 6000,
    system,
    messages: [{ role: "user", content: `Authorized quote context:\n${JSON.stringify(args)}` }],
    tools: [quoteTool],
    tool_choice: { type: "tool", name: "finalize_ada_quote" },
  });
  const control = response.content.find((part): part is Anthropic.ToolUseBlock => part.type === "tool_use" && part.name === "finalize_ada_quote");
  if (!control) throw new Error(response.stop_reason === "max_tokens" ? "Ada's structured quote exceeded the output limit." : "Ada returned no structured quote.");
  return parseGeneratedQuote(control.input);
}