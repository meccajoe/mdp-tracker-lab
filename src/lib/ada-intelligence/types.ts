export type AdaIntelligenceResource = "materials" | "projects" | "quote_lines" | "expenses" | "labor" | "formulas";
export type AdaEvidenceConfidence = "high" | "medium" | "low";

export type AdaEvidence = {
  resource: AdaIntelligenceResource;
  sourceId: string;
  title: string;
  rationale: string;
  freshness?: string | null;
  confidence: AdaEvidenceConfidence;
  data: Record<string, unknown>;
  pricingAnchor: boolean;
  link?: string | null;
};

export type AdaSourceStatus = {
  resource: AdaIntelligenceResource | "scope";
  status: "ok" | "failed" | "skipped";
  count: number;
  limitation?: string;
};

export type AdaIntelligenceActor = {
  actorRole: string | null;
  pmInitials: string | null;
  currentTrackerProjectId?: string | null;
};

export type AdaIntelligencePlan = {
  terms: string[];
  resources: AdaIntelligenceResource[];
};

export type AdaProjectScope =
  | { mode: "all" }
  | { mode: "pm"; pmInitials: string }
  | { mode: "none" };
