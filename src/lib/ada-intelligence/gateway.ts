import { buildAdaIntelligencePlan, buildAdaLaborSummaryEvidence, buildAdaProjectScope, enforceComparableGate, sanitizeAdaSearchTerm } from "./planner";
import type { AdaEvidence, AdaIntelligenceActor, AdaIntelligenceResource, AdaSourceStatus } from "./types";

export const MAX_EVIDENCE_PER_RESOURCE = 5;
const MAX_AUTHORIZED_PROJECTS = 500;

type QueryResult = { data: any[] | null; error: { message: string } | null };
type ResourceResult = { evidence: AdaEvidence[]; status: AdaSourceStatus; projectIds?: string[] };

function ok(resource: AdaIntelligenceResource, evidence: AdaEvidence[], projectIds?: string[]): ResourceResult {
  return { evidence, status: { resource, status: "ok", count: evidence.length }, projectIds };
}

function failed(resource: AdaIntelligenceResource, message: string): ResourceResult {
  return { evidence: [], status: { resource, status: "failed", count: 0, limitation: `${resource} evidence was unavailable: ${message}` } };
}

function skipped(resource: AdaIntelligenceResource, limitation: string): ResourceResult {
  return { evidence: [], status: { resource, status: "skipped", count: 0, limitation } };
}

async function safeResource(resource: AdaIntelligenceResource, loader: () => Promise<ResourceResult>) {
  try {
    return await loader();
  } catch (error) {
    return failed(resource, error instanceof Error ? error.message : "unknown source error");
  }
}

function uniqueRows(rows: any[]) {
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

async function loadAuthorizedProjectIds(supabase: any, actor: AdaIntelligenceActor) {
  const scope = buildAdaProjectScope({ role: actor.actorRole, pmInitials: actor.pmInitials });
  if (scope.mode === "all") return { scope, authorizedProjectIds: null as string[] | null, status: { resource: "scope" as const, status: "ok" as const, count: 0 } };
  if (scope.mode === "none") return { scope, authorizedProjectIds: [] as string[], status: { resource: "scope" as const, status: "skipped" as const, count: 0, limitation: "This Ada user has no authorized Tracker project scope." } };
  const { data, error } = await supabase.from("projects").select("id").eq("pm", scope.pmInitials).limit(MAX_AUTHORIZED_PROJECTS);
  if (error) return { scope, authorizedProjectIds: [] as string[], status: { resource: "scope" as const, status: "failed" as const, count: 0, limitation: `Tracker project scope was unavailable: ${error.message}` } };
  const ids = (data ?? []).map((row: any) => String(row.id)).filter((id: string) => id !== actor.currentTrackerProjectId);
  return { scope, authorizedProjectIds: ids, status: { resource: "scope" as const, status: "ok" as const, count: ids.length } };
}

function applyProjectIds(builder: any, authorizedProjectIds: string[] | null) {
  return authorizedProjectIds === null ? builder : builder.in("project_id", authorizedProjectIds);
}

function searchPattern(terms: string[]) {
  const term = sanitizeAdaSearchTerm(terms[0] ?? "");
  return term ? `%${term}%` : "%";
}

async function loadMaterials(supabase: any, terms: string[]): Promise<ResourceResult> {
  const pattern = searchPattern(terms);
  const [materials, aliases] = await Promise.all([
    supabase.from("materials").select("id, canonical_name, category, subcategory, dimensions, base_unit, default_price, sku_or_code, finish, notes, updated_at").eq("active", true).ilike("search_text", pattern).limit(MAX_EVIDENCE_PER_RESOURCE),
    supabase.from("material_aliases").select("id, material_id, alias_text").ilike("alias_text", pattern).limit(MAX_EVIDENCE_PER_RESOURCE),
  ]) as [QueryResult, QueryResult];
  if (materials.error) return failed("materials", materials.error.message);
  if (aliases.error) return failed("materials", aliases.error.message);
  const aliasMaterialIds = (aliases.data ?? []).map((row) => row.material_id).filter(Boolean);
  let aliasMaterials: any[] = [];
  if (aliasMaterialIds.length) {
    const result = await supabase.from("materials").select("id, canonical_name, category, subcategory, dimensions, base_unit, default_price, sku_or_code, finish, notes, updated_at").in("id", aliasMaterialIds).eq("active", true);
    if (result.error) return failed("materials", result.error.message);
    aliasMaterials = result.data ?? [];
  }
  const rows = uniqueRows([...(materials.data ?? []), ...aliasMaterials]).slice(0, MAX_EVIDENCE_PER_RESOURCE);
  const ids = rows.map((row) => row.id);
  let prices: any[] = [];
  if (ids.length) {
    const result = await supabase.from("material_vendor_prices").select("id, material_id, vendor_id, vendor_sku, vendor_material_name, unit, pack_quantity, price, price_basis, effective_date, source_type, is_current").in("material_id", ids).eq("is_current", true).order("effective_date", { ascending: false }).limit(MAX_EVIDENCE_PER_RESOURCE * 3);
    if (!result.error) prices = result.data ?? [];
  }
  const aliasesByMaterial = new Map<string, string[]>();
  for (const alias of aliases.data ?? []) aliasesByMaterial.set(alias.material_id, [...(aliasesByMaterial.get(alias.material_id) ?? []), alias.alias_text]);
  return ok("materials", rows.map((row) => ({
    resource: "materials", sourceId: String(row.id), title: row.canonical_name,
    rationale: aliasesByMaterial.has(row.id) ? `Material alias match: ${(aliasesByMaterial.get(row.id) ?? []).join(", ")}` : "Canonical material catalog match",
    freshness: row.updated_at, confidence: "high", pricingAnchor: false,
    data: { ...row, aliases: aliasesByMaterial.get(row.id) ?? [], current_vendor_prices: prices.filter((price) => price.material_id === row.id) },
    link: `/admin/materials/${row.id}`,
  })));
}

async function loadProjects(supabase: any, terms: string[], actor: AdaIntelligenceActor, scope: ReturnType<typeof buildAdaProjectScope>): Promise<ResourceResult> {
  if (scope.mode === "none") return skipped("projects", "Historical projects are outside this user's Tracker scope.");
  const term = sanitizeAdaSearchTerm(terms[0] ?? "");
  let query = supabase.from("project_pricing_index").select("id, name, client, project_type, close_date, contract_amount, status, pm, hubspot_deal_url, quote_labor, quote_materials, quote_design, quote_pm, quote_shipping, quote_crating, quote_id_labor, quote_travel, quote_storage, quote_props, quote_equipment, quote_rental, quote_flooring, budget_hrs, budget_materials, total_spent, qbo_total_hours, qbo_labor_cost");
  if (scope.mode === "pm") query = query.eq("pm", scope.pmInitials);
  if (actor.currentTrackerProjectId) query = query.neq("id", actor.currentTrackerProjectId);
  if (term) query = query.or(`name.ilike.%${term}%,client.ilike.%${term}%,project_type.ilike.%${term}%`);
  const result: QueryResult = await query.order("close_date", { ascending: false }).limit(MAX_EVIDENCE_PER_RESOURCE);
  if (result.error) return failed("projects", result.error.message);
  const rows = result.data ?? [];
  return ok("projects", rows.map((row) => ({
    resource: "projects", sourceId: String(row.id), title: row.name,
    rationale: row.project_type ? `Authorized comparable with project type ${row.project_type}` : "Authorized historical project match",
    freshness: row.close_date, confidence: row.project_type ? "high" : "medium", pricingAnchor: Boolean(row.project_type && Number(row.contract_amount) > 0),
    data: row, link: `/projects/${row.id}`,
  })), rows.map((row) => String(row.id)));
}

async function loadQuoteLines(supabase: any, terms: string[], authorizedProjectIds: string[] | null, currentTrackerProjectId?: string | null): Promise<ResourceResult> {
  if (authorizedProjectIds?.length === 0) return skipped("quote_lines", "Historical quote lines are outside this user's Tracker scope.");
  let query = supabase.from("quote_line_items").select("id, project_id, project_name, source, source_ref, source_date, sku, description, unit_cost, quantity, line_total, vendor").ilike("raw_text", searchPattern(terms));
  query = applyProjectIds(query, authorizedProjectIds);
  if (currentTrackerProjectId) query = query.neq("project_id", currentTrackerProjectId);
  const result: QueryResult = await query.order("source_date", { ascending: false }).limit(MAX_EVIDENCE_PER_RESOURCE);
  if (result.error) return failed("quote_lines", result.error.message);
  const rows = result.data ?? [];
  return ok("quote_lines", rows.map((row) => ({
    resource: "quote_lines", sourceId: String(row.id), title: row.description || row.sku || "Historical quote line",
    rationale: "Authorized historical line-item text/SKU match", freshness: row.source_date, confidence: "medium", pricingAnchor: false,
    data: row, link: row.project_id ? `/projects/${row.project_id}` : null,
  })), rows.map((row) => String(row.project_id)).filter(Boolean));
}

async function loadExpenses(supabase: any, terms: string[], authorizedProjectIds: string[] | null, relevantProjectIds: string[]): Promise<ResourceResult> {
  if (authorizedProjectIds?.length === 0) return skipped("expenses", "Expense and vendor history is outside this user's Tracker scope.");
  let query = supabase.from("expenses").select("id, project_id, vendor, category, cogs_code, amount, date, notes");
  const boundedIds = authorizedProjectIds === null ? relevantProjectIds : authorizedProjectIds;
  if (boundedIds.length) query = query.in("project_id", boundedIds);
  else if (authorizedProjectIds !== null) return skipped("expenses", "No authorized related projects were found for expense retrieval.");
  const term = sanitizeAdaSearchTerm(terms[0] ?? "");
  if (term) query = query.or(`vendor.ilike.%${term}%,category.ilike.%${term}%,notes.ilike.%${term}%`);
  const result: QueryResult = await query.order("date", { ascending: false }).limit(MAX_EVIDENCE_PER_RESOURCE);
  if (result.error) return failed("expenses", result.error.message);
  return ok("expenses", (result.data ?? []).map((row) => ({
    resource: "expenses", sourceId: String(row.id), title: row.vendor || row.category || "Historical expense",
    rationale: "Authorized vendor/category expense match", freshness: row.date, confidence: "medium", pricingAnchor: false,
    data: row, link: row.project_id ? `/projects/${row.project_id}` : null,
  })));
}

async function loadLabor(supabase: any, authorizedProjectIds: string[] | null, relevantProjectIds: string[]): Promise<ResourceResult> {
  if (authorizedProjectIds?.length === 0) return skipped("labor", "Labor actuals are outside this user's Tracker scope.");
  const boundedIds = authorizedProjectIds === null ? relevantProjectIds : relevantProjectIds.filter((id) => authorizedProjectIds.includes(id));
  if (!boundedIds.length) return skipped("labor", "No relevant authorized projects were identified for labor actuals.");
  const result: QueryResult = await supabase.from("project_summary").select("id, name, qbo_total_hours, qbo_labor_cost, updated_at").in("id", boundedIds).order("updated_at", { ascending: false }).limit(MAX_EVIDENCE_PER_RESOURCE);
  if (result.error) return failed("labor", result.error.message);
  return ok("labor", buildAdaLaborSummaryEvidence(result.data ?? []));
}

async function loadFormulas(supabase: any, terms: string[]): Promise<ResourceResult> {
  const term = sanitizeAdaSearchTerm(terms[0] ?? "");
  let query = supabase.from("budget_formula_settings").select("category, label, default_pct, updated_at");
  if (term) query = query.or(`category.ilike.%${term}%,label.ilike.%${term}%`);
  let result: QueryResult = await query.order("category").limit(MAX_EVIDENCE_PER_RESOURCE);
  if (result.error) return failed("formulas", result.error.message);
  if (!(result.data ?? []).length && term) {
    const fallbackFormulaResult: QueryResult = await supabase.from("budget_formula_settings").select("category, label, default_pct, updated_at").order("category").limit(MAX_EVIDENCE_PER_RESOURCE);
    if (fallbackFormulaResult.error) return failed("formulas", fallbackFormulaResult.error.message);
    result = fallbackFormulaResult;
  }
  return ok("formulas", (result.data ?? []).map((row) => ({
    resource: "formulas", sourceId: String(row.category), title: row.label,
    rationale: "Current Tracker budget formula setting", freshness: row.updated_at, confidence: "high", pricingAnchor: false,
    data: row, link: "/admin/settings",
  })));
}

export async function retrieveAdaIntelligence(supabase: any, query: string, actor: AdaIntelligenceActor = { actorRole: null, pmInitials: null }) {
  const plan = buildAdaIntelligencePlan(query);
  if (!plan.terms.length) return { evidence: [] as AdaEvidence[], limitations: ["Ask Ada about a material, scope, labor, vendor, or comparable project to search Tracker evidence."], sourceStatus: [] as AdaSourceStatus[], plan };

  const scopeResult = await loadAuthorizedProjectIds(supabase, actor);
  const { scope, authorizedProjectIds } = scopeResult;
  const firstWave = await Promise.all([
    plan.resources.includes("materials") ? safeResource("materials", () => loadMaterials(supabase, plan.terms)) : Promise.resolve(skipped("materials", "Not relevant to this question.")),
    plan.resources.includes("projects") ? safeResource("projects", () => loadProjects(supabase, plan.terms, actor, scope)) : Promise.resolve(skipped("projects", "Not relevant to this question.")),
    plan.resources.includes("quote_lines") ? safeResource("quote_lines", () => loadQuoteLines(supabase, plan.terms, authorizedProjectIds, actor.currentTrackerProjectId)) : Promise.resolve(skipped("quote_lines", "Not relevant to this question.")),
  ]);
  const relevantProjectIds = [...new Set(firstWave.flatMap((result) => result.projectIds ?? []))].filter((id) => id !== actor.currentTrackerProjectId);
  const secondWave = await Promise.all([
    plan.resources.includes("expenses") ? safeResource("expenses", () => loadExpenses(supabase, plan.terms, authorizedProjectIds, relevantProjectIds)) : Promise.resolve(skipped("expenses", "Not relevant to this question.")),
    plan.resources.includes("labor") ? safeResource("labor", () => loadLabor(supabase, authorizedProjectIds, relevantProjectIds)) : Promise.resolve(skipped("labor", "Not relevant to this question.")),
    plan.resources.includes("formulas") ? safeResource("formulas", () => loadFormulas(supabase, plan.terms)) : Promise.resolve(skipped("formulas", "Not relevant to this question.")),
  ]);
  const results = [...firstWave, ...secondWave].filter((result) => plan.resources.includes(result.status.resource as AdaIntelligenceResource));
  const gated = enforceComparableGate(results.flatMap((result) => result.evidence), plan.resources.includes("projects"));
  const sourceStatus: AdaSourceStatus[] = [scopeResult.status, ...results.map((result) => result.status)];
  const limitations = [
    ...gated.limitations,
    ...sourceStatus.filter((status) => status.status !== "ok" && status.limitation).map((status) => status.limitation as string),
  ];
  return { evidence: gated.evidence, limitations: [...new Set(limitations)], sourceStatus, plan, meaningfulComparableCount: gated.meaningfulComparableCount };
}
