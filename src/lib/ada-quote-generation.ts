import Anthropic from "@anthropic-ai/sdk";
import { selectAdaModel } from "@/lib/ada-model-policy";
import { ADA_SOUL } from "@/lib/ada-soul";

export type GeneratedQuote = { lineItems: Array<{ itemName: string; lineType: "material" | "labor"; internalCost: number; clientPrice: number; assumption?: string }>; assumptions: string[]; evidence: unknown[] };

export async function generateAdaQuote(args: { messages: Array<{ content: string }>; assets: unknown[]; intelligence: unknown[]; existingQuote?: unknown; instruction?: string }) {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  const model = selectAdaModel({ purpose: "quote", complexity: "standard", lowConfidence: false });
  const prompt = `${ADA_SOUL}\n\nCreate or revise a reviewable Mecca quote from this grounded context. If an existing quote and instruction are supplied, preserve unrelated lines and apply only the requested correction. Return only JSON: {"lineItems":[{"itemName":"","lineType":"material|labor","internalCost":0,"clientPrice":0,"assumption":""}],"assumptions":[],"evidence":[]}. Use Tracker sources including project_pricing_index and quote_line_items only as cited calibration. Never invent costs. Context: ${JSON.stringify(args)}`;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] });
  const text = response.content.filter((part): part is Anthropic.TextBlock => part.type === "text").map((part) => part.text).join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Ada returned no structured quote.");
  const quote = JSON.parse(match[0]) as GeneratedQuote;
  if (!Array.isArray(quote.lineItems) || quote.lineItems.some((line) => !line.itemName || !Number.isFinite(line.internalCost) || !Number.isFinite(line.clientPrice))) throw new Error("Ada returned an invalid quote structure.");
  return quote;
}
