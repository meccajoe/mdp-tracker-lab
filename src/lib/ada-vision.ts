import Anthropic from "@anthropic-ai/sdk";

import { selectAdaModel } from "@/lib/ada-model-policy";

type DrawingAnalysis = {
  summary: string;
  components: Array<{ name: string; description: string; dimensions?: string; confidence: "high" | "medium" | "low" }>;
  materials: string[];
  dimensions: string[];
  risks: string[];
  questions: string[];
  complexity: "simple" | "standard" | "complex";
  confidence: "high" | "medium" | "low";
};

const ANALYSIS_INSTRUCTIONS = `You are Ada, the Mecca Design & Production estimating assistant. Inspect the supplied drawing or reference file. Return only valid JSON with this shape: {"summary":"...","components":[{"name":"...","description":"...","dimensions":"...","confidence":"high|medium|low"}],"materials":["..."],"dimensions":["..."],"risks":["..."],"questions":["..."],"complexity":"simple|standard|complex","confidence":"high|medium|low"}. Never invent dimensions or materials. Put ambiguity and missing information into questions and risks.`;

function getClient() {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  return new Anthropic({ apiKey });
}

function extractText(response: Anthropic.Message) {
  return response.content.filter((block): block is Anthropic.TextBlock => block.type === "text").map((block) => block.text).join("\n");
}

function normalizeConfidence(value: unknown): DrawingAnalysis["confidence"] {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeComplexity(value: unknown): DrawingAnalysis["complexity"] {
  return value === "simple" || value === "complex" ? value : "standard";
}

export function parseDrawingAnalysis(text: string): DrawingAnalysis {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Ada vision returned no structured analysis.");
  const parsed = JSON.parse(match[0]) as Partial<DrawingAnalysis>;
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "Analysis available.",
    components: Array.isArray(parsed.components) ? parsed.components.map((component) => ({
      name: typeof component?.name === "string" ? component.name : "Unlabeled component",
      description: typeof component?.description === "string" ? component.description : "",
      dimensions: typeof component?.dimensions === "string" ? component.dimensions : undefined,
      confidence: normalizeConfidence(component?.confidence),
    })) : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials.filter((value): value is string => typeof value === "string") : [],
    dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions.filter((value): value is string => typeof value === "string") : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter((value): value is string => typeof value === "string") : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions.filter((value): value is string => typeof value === "string") : [],
    complexity: normalizeComplexity(parsed.complexity),
    confidence: normalizeConfidence(parsed.confidence),
  };
}

async function requestAnalysis(args: { client: Anthropic; model: string; buffer: Buffer; mimeType: string; fileName: string; priorAnalysis?: DrawingAnalysis }) {
  const assetBlock = args.mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: args.buffer.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: args.mimeType, data: args.buffer.toString("base64") } };
  const reviewContext = args.priorAnalysis ? `\n\nA first-pass analysis is below. Review the original file yourself and correct any omission or uncertainty:\n${JSON.stringify(args.priorAnalysis)}` : "";
  const response = await args.client.messages.create({
    model: args.model,
    max_tokens: 3000,
    system: ANALYSIS_INSTRUCTIONS,
    messages: [{ role: "user", content: [assetBlock, { type: "text", text: `File name: ${args.fileName}${reviewContext}` }] } as any],
  });
  return parseDrawingAnalysis(extractText(response));
}

export async function analyzeAdaAsset(args: { buffer: Buffer; mimeType: string; fileName: string }) {
  const client = getClient();
  const firstModel = selectAdaModel({ purpose: "vision", complexity: "standard", lowConfidence: false });
  const firstPass = await requestAnalysis({ client, model: firstModel, ...args });
  const needsOpusReview = firstPass.complexity === "complex" || firstPass.confidence === "low";
  const finalModel = selectAdaModel({ purpose: "vision", complexity: firstPass.complexity, lowConfidence: firstPass.confidence === "low" });
  const analysis = needsOpusReview && finalModel !== firstModel
    ? await requestAnalysis({ client, model: finalModel, priorAnalysis: firstPass, ...args })
    : firstPass;

  return {
    analysis,
    modelTrace: [
      { model: firstModel, purpose: "vision_first_pass" },
      ...(needsOpusReview && finalModel !== firstModel ? [{ model: finalModel, purpose: "opus_escalation" }] : []),
    ],
  };
}
