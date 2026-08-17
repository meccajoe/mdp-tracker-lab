export const MAX_EVIDENCE_PER_RESOURCE = 5;

type Evidence = { resource: string; sourceId: string; title: string; rationale: string; freshness?: string | null; confidence: "high" | "medium" | "low"; data: Record<string, unknown> };

export async function retrieveAdaIntelligence(supabase: any, query: string) {
  const term = query.trim();
  if (!term) return { evidence: [] as Evidence[], limitations: ["Ask Ada about a material, scope, or comparable project to search Tracker evidence."] };
  const [materialsResult, projectsResult, summaryResult, linesResult] = await Promise.all([
    supabase.from("materials").select("id, canonical_name, category, default_price, updated_at").ilike("canonical_name", `%${term}%`).limit(MAX_EVIDENCE_PER_RESOURCE),
    supabase.from("project_pricing_index").select("id, name, project_type, contract_amount, total_spent, close_date").or(`name.ilike.%${term}%,project_type.ilike.%${term}%`).limit(MAX_EVIDENCE_PER_RESOURCE),
    supabase.from("project_summary").select("id, name, total_budget, total_spent, qbo_total_hours, updated_at").ilike("name", `%${term}%`).limit(MAX_EVIDENCE_PER_RESOURCE),
    supabase.from("quote_line_items").select("id, project_id, sku, description, quantity, line_total, source_date").ilike("description", `%${term}%`).limit(MAX_EVIDENCE_PER_RESOURCE),
  ]);
  const evidence: Evidence[] = [
    ...(materialsResult.data ?? []).map((row: any) => ({ resource: "materials", sourceId: row.id, title: row.canonical_name, rationale: "Catalog name match", freshness: row.updated_at, confidence: "high", data: row })),
    ...(projectsResult.data ?? []).map((row: any) => ({ resource: "project_pricing_index", sourceId: row.id, title: row.name, rationale: row.project_type ? `Comparable project type: ${row.project_type}` : "Historical project match", freshness: row.close_date, confidence: "medium", data: row })),
    ...(summaryResult.data ?? []).map((row: any) => ({ resource: "project_summary", sourceId: row.id, title: row.name, rationale: "Operational budget and actuals match", freshness: row.updated_at, confidence: "medium", data: row })),
    ...(linesResult.data ?? []).map((row: any) => ({ resource: "quote_line_items", sourceId: row.id, title: row.description || row.sku || "Historical line item", rationale: "Historical line-item description match", freshness: row.source_date, confidence: "medium", data: row })),
  ];
  const comparableCount = evidence.filter((item) => item.resource === "project_pricing_index").length;
  const limitations = comparableCount < 2 ? ["Fewer than two meaningful comparables were found; do not use this as a pricing anchor."] : [];
  return { evidence, limitations };
}
