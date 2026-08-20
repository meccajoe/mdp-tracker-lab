import Anthropic from "@anthropic-ai/sdk";
import { selectAdaModel } from "@/lib/ada-model-policy";
import { ADA_SOUL } from "@/lib/ada-soul";

export type GeneratedQuote = { lineItems: Array<{ itemName: string; buildItem: string; lineType: "material" | "labor"; internalCost: number; clientPrice: number; confidence: "high" | "medium" | "low"; evidenceRefs: string[]; pricingBasis: "user_input" | "tracker_evidence" | "expert_estimate" | "blended"; assumption?: string }>; assumptions: string[]; evidence: unknown[] };

export async function generateAdaQuote(args: { messages: Array<{ content: string }>; assets: unknown[]; intelligence: unknown[]; existingQuote?: unknown; instruction?: string }) {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  const model = selectAdaModel({ purpose: "quote", complexity: "standard", lowConfidence: false });
  const prompt = `${ADA_SOUL}\n\nCreate or revise a complete, reviewable Mecca quote from this context. If an existing quote and instruction are supplied, preserve unrelated lines and apply only the requested correction. Return only JSON: {"lineItems":[{"itemName":"","buildItem":"","lineType":"material|labor","internalCost":0,"clientPrice":0,"confidence":"high|medium|low","evidenceRefs":["asset:<asset-id>:page:<page-number>|resource:<resource-id>"],"pricingBasis":"user_input|tracker_evidence|expert_estimate|blended","assumption":""}],"assumptions":[],"evidence":[]}. Group related material and labor under the same buildItem.

Pricing hierarchy: (1) explicit current user inputs, (2) relevant authorized Tracker evidence such as project_pricing_index and quote_line_items, (3) your Opus-level industry knowledge and expert judgment, or (4) a clearly labeled blend. Only prices stated directly by a user count as user_input. Prior assistant/Ada estimates remain expert_estimate; never relabel Ada's prior estimate as user input or describe it as client-supplied pricing. Sparse Tracker data is not a reason to refuse. When exact rates are absent, derive reasonable quantities, market-aware material costs, fabrication productivity and labor rates, packing/freight/install allowances, and client pricing appropriate to the stated geography, timing, complexity, and risk. Deliver a single best point estimate suitable for Paul to review. Never return zero or pending pricing merely because a source rate is missing. Use assumptions, confidence, and prudent allowance/contingency lines where an experienced estimator would.

Use evidenceRefs only for actual supplied asset/resource IDs. Cite PDFs by exact page when available. Never fabricate a source or label expert knowledge as Tracker evidence. Every expert_estimate or blended line must include a concise assumption explaining its pricing basis; include structured expert-estimate records in evidence where useful. Context: ${JSON.stringify(args)}`;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] });
  const text = response.content.filter((part): part is Anthropic.TextBlock => part.type === "text").map((part) => part.text).join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Ada returned no structured quote.");
  const quote = JSON.parse(match[0]) as GeneratedQuote;
  if (!Array.isArray(quote.lineItems) || quote.lineItems.some((line) => !line.itemName || !line.buildItem || !["high", "medium", "low"].includes(line.confidence) || !["user_input", "tracker_evidence", "expert_estimate", "blended"].includes(line.pricingBasis) || !Array.isArray(line.evidenceRefs) || !Number.isFinite(line.internalCost) || !Number.isFinite(line.clientPrice) || ((line.pricingBasis === "expert_estimate" || line.pricingBasis === "blended") && !line.assumption?.trim()))) throw new Error("Ada returned an invalid quote structure.");
  return quote;
}
