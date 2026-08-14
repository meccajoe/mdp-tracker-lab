export type AdaModelPurpose = "vision" | "quote" | "conversation" | "final_review";
export type AdaAnalysisComplexity = "simple" | "standard" | "complex";

export type AdaModelSettings = {
  opusModel: string;
  visionModel: string;
};

export function getAdaModelSettings(): AdaModelSettings {
  return {
    opusModel: process.env.ADA_OPUS_MODEL || "claude-opus-4-8",
    visionModel: process.env.ADA_VISION_MODEL || "claude-sonnet-4-6",
  };
}

export function selectAdaModel(
  input: { purpose: AdaModelPurpose; complexity: AdaAnalysisComplexity; lowConfidence: boolean },
  settings: AdaModelSettings = getAdaModelSettings(),
) {
  if (input.purpose === "quote" || input.purpose === "conversation" || input.purpose === "final_review") return settings.opusModel;
  if (input.complexity === "complex" || input.lowConfidence) return settings.opusModel;
  return settings.visionModel;
}
