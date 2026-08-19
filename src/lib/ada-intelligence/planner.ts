import type { AdaEvidence, AdaIntelligencePlan, AdaIntelligenceResource, AdaProjectScope } from "./types";

const FINANCIAL_FIELDS = new Set([
  "contract_amount", "total_spent", "total_budget", "line_total", "unit_cost", "amount",
  "quote_labor", "quote_materials", "quote_design", "quote_pm", "quote_shipping", "quote_crating",
  "quote_id_labor", "quote_travel", "quote_storage", "quote_props", "quote_equipment", "quote_rental",
  "quote_flooring", "qbo_labor_cost", "qbo_total_hours",
]);

const MATERIAL_TERMS = /\b(material|fabric|seg|wood|plywood|mdf|laminate|vinyl|paint|aluminum|extrusion|graphic|finish|substrate)\b/i;
const PROJECT_TERMS = /\b(similar|comparable|history|historical|project|job|booth|exhibit|wall|museum|retail|event|build|scope|price|pricing|cost|budget|margin|quote)\b/i;
const QUOTE_TERMS = /\b(quote|quoted|sku|line item|sell|price|pricing|cost|budget|scope|material|labor|fabrication|install|shipping|crating)\b/i;
const EXPENSE_TERMS = /\b(vendor|expense|paid|purchase|invoice|bill|cost|material|shipping|freight|travel|rental)\b/i;
const LABOR_TERMS = /\b(labor|hours|hour|install|installation|fabrication|production|design time|setup|strike|i&d)\b/i;
const FORMULA_TERMS = /\b(formula|hours|labor|budget|allowance|rate|sqft|square feet|frame count|bematrix|graphics)\b/i;

export function sanitizeAdaSearchTerm(input: string) {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s&-]/gu, " ")
    .replace(/[._(),:%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extractTerms(query: string) {
  const sanitized = sanitizeAdaSearchTerm(query);
  if (!sanitized) return [];
  const phrases = ["SEG fabric", "trade show", "back wall", "hard wall", "install labor", "I&D labor", "project management", "square feet", "client pickup"]
    .filter((phrase) => sanitized.toLowerCase().includes(phrase.toLowerCase()));
  const stopwords = new Set(["what", "have", "we", "paid", "vendors", "vendor", "for", "recently", "how", "many", "should", "this", "take", "does", "the", "and", "with", "from", "into", "about", "need", "use", "can", "you", "our", "that"]);
  const words = sanitized.split(" ").filter((word) => word.length > 2 && !stopwords.has(word.toLowerCase()));
  const fallback = words.slice(-2).join(" ");
  return [...new Set([...phrases, fallback].filter(Boolean))].slice(0, 3);
}

export function buildAdaIntelligenceQuery(input: { message: string; workspaceTitle?: string | null; clientName?: string | null; recentMessages?: string[] }) {
  return [
    input.message,
    input.workspaceTitle ? `Workspace: ${input.workspaceTitle}` : "",
    input.clientName ? `Client: ${input.clientName}` : "",
    ...(input.recentMessages ?? []).slice(-4).map((message) => `Recent scope: ${message}`),
  ].filter(Boolean).join("\n").slice(0, 600);
}

export function buildAdaIntelligencePlan(query: string): AdaIntelligencePlan {
  const resources: AdaIntelligenceResource[] = [];
  const asksMaterials = MATERIAL_TERMS.test(query);
  const asksLabor = LABOR_TERMS.test(query);
  if (asksMaterials) resources.push("materials");
  if (PROJECT_TERMS.test(query) || asksLabor) resources.push("projects");
  if (QUOTE_TERMS.test(query) || asksMaterials) resources.push("quote_lines");
  if (EXPENSE_TERMS.test(query)) resources.push("expenses");
  if (asksLabor) resources.push("labor");
  if (FORMULA_TERMS.test(query)) resources.push("formulas");
  if (!resources.length) resources.push("materials", "projects", "quote_lines");
  return { terms: extractTerms(query), resources };
}

export function buildAdaProjectScope(input: { role: string | null; pmInitials: string | null }): AdaProjectScope {
  if (input.role === "admin") return { mode: "all" };
  if (input.role === "pm" && input.pmInitials?.trim()) return { mode: "pm", pmInitials: input.pmInitials.trim().toUpperCase() };
  return { mode: "none" };
}

export function buildAdaLaborSummaryEvidence(rows: Array<Record<string, unknown>>): AdaEvidence[] {
  return rows
    .filter((row) => String(row.id ?? "") && Number(row.qbo_total_hours ?? 0) > 0)
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
    .slice(0, 5)
    .map((row) => {
      const projectId = String(row.id);
      const totalHours = Number(row.qbo_total_hours ?? 0);
      return {
        resource: "labor",
        sourceId: projectId,
        title: `${String(row.name ?? projectId)} · ${totalHours} actual hours`,
        rationale: "Canonical authorized project labor summary from QBO actuals",
        freshness: typeof row.updated_at === "string" ? row.updated_at : null,
        confidence: "high",
        pricingAnchor: false,
        data: { project_id: projectId, project_name: row.name ?? null, total_hours: totalHours, total_labor_cost: Number(row.qbo_labor_cost ?? 0) },
        link: `/projects/${projectId}`,
      };
    });
}

function withoutFinancialAnchors(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !FINANCIAL_FIELDS.has(key)));
}

export function enforceComparableGate(evidence: AdaEvidence[], comparablesRequested = true) {
  const meaningfulComparableCount = new Set(
    evidence.filter((item) => item.resource === "projects" && item.pricingAnchor).map((item) => item.sourceId),
  ).size;
  if (!comparablesRequested || meaningfulComparableCount >= 2) return { evidence, limitations: [] as string[], meaningfulComparableCount };
  return {
    evidence: evidence.map((item) => item.resource === "projects" && item.pricingAnchor
      ? { ...item, pricingAnchor: false, data: withoutFinancialAnchors(item.data) }
      : item),
    limitations: ["Fewer than two meaningful authorized comparables were found; historical financial values were withheld and must not be used as a pricing anchor."],
    meaningfulComparableCount,
  };
}
