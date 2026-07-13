import {
  CATEGORY_SCOPE_CONFIG,
  type CategoryScopeKey,
  type RecommendationProjectFacts,
} from "./project-notification-recommendations.ts";

export type ProjectCopilotContext = {
  project: RecommendationProjectFacts;
  categoryActuals: Partial<Record<CategoryScopeKey, number>>;
};

function coerceProjectFacts(row: Record<string, unknown>): RecommendationProjectFacts {
  return {
    id: String(row.id),
    name: String(row.name ?? row.id),
    budget_hrs: typeof row.budget_hrs === "number" ? row.budget_hrs : Number(row.budget_hrs ?? 0) || null,
    qbo_total_hours: typeof row.qbo_total_hours === "number" ? row.qbo_total_hours : Number(row.qbo_total_hours ?? 0) || 0,
    total_budget: typeof row.total_budget === "number" ? row.total_budget : Number(row.total_budget ?? 0) || 0,
    total_spent: typeof row.total_spent === "number" ? row.total_spent : Number(row.total_spent ?? 0) || 0,
    budget_materials: typeof row.budget_materials === "number" ? row.budget_materials : Number(row.budget_materials ?? 0) || null,
    budget_design: typeof row.budget_design === "number" ? row.budget_design : Number(row.budget_design ?? 0) || null,
    budget_pm: typeof row.budget_pm === "number" ? row.budget_pm : Number(row.budget_pm ?? 0) || null,
    budget_shipping: typeof row.budget_shipping === "number" ? row.budget_shipping : Number(row.budget_shipping ?? 0) || null,
    budget_id_labor: typeof row.budget_id_labor === "number" ? row.budget_id_labor : Number(row.budget_id_labor ?? 0) || null,
    budget_travel: typeof row.budget_travel === "number" ? row.budget_travel : Number(row.budget_travel ?? 0) || null,
    budget_storage: typeof row.budget_storage === "number" ? row.budget_storage : Number(row.budget_storage ?? 0) || null,
    budget_props: typeof row.budget_props === "number" ? row.budget_props : Number(row.budget_props ?? 0) || null,
    budget_equipment: typeof row.budget_equipment === "number" ? row.budget_equipment : Number(row.budget_equipment ?? 0) || null,
    budget_rental: typeof row.budget_rental === "number" ? row.budget_rental : Number(row.budget_rental ?? 0) || null,
    budget_crating: typeof row.budget_crating === "number" ? row.budget_crating : Number(row.budget_crating ?? 0) || null,
    budget_flooring: typeof row.budget_flooring === "number" ? row.budget_flooring : Number(row.budget_flooring ?? 0) || null,
  };
}

function buildCategoryActuals(expenseRows: Array<{ category: string; amount: number | string | null }>) {
  const actuals: Partial<Record<CategoryScopeKey, number>> = {};

  for (const [scopeKey, config] of Object.entries(CATEGORY_SCOPE_CONFIG) as Array<[CategoryScopeKey, (typeof CATEGORY_SCOPE_CONFIG)[CategoryScopeKey]]>) {
    actuals[scopeKey] = expenseRows
      .filter((row) => config.expenseCategories.some((category) => category === row.category))
      .reduce((sum, row) => sum + (typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0) || 0), 0);
  }

  return actuals;
}

export async function fetchProjectCopilotContext(supabase: any, projectId: string): Promise<{ data: ProjectCopilotContext | null; error: string | null }> {
  const projectResult: any = await supabase
    .from("project_summary")
    .select("id, name, budget_hrs, qbo_total_hours, total_budget, total_spent, budget_materials, budget_design, budget_pm, budget_shipping, budget_id_labor, budget_travel, budget_storage, budget_props, budget_equipment, budget_rental, budget_crating, budget_flooring")
    .eq("id", projectId)
    .maybeSingle();

  const { data: projectRow, error: projectError } = projectResult;

  if (projectError) {
    return { data: null, error: projectError.message };
  }

  if (!projectRow) {
    return { data: null, error: "Project not found" };
  }

  const expenseResult: any = await supabase
    .from("expenses")
    .select("category, amount")
    .eq("project_id", projectId);

  const { data: expenseRows, error: expenseError } = expenseResult;

  if (expenseError) {
    return { data: null, error: expenseError.message };
  }

  return {
    data: {
      project: coerceProjectFacts(projectRow as Record<string, unknown>),
      categoryActuals: buildCategoryActuals((expenseRows ?? []) as Array<{ category: string; amount: number | string | null }>),
    },
    error: null,
  };
}
