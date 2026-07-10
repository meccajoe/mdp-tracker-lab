import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  buildProjectNotificationRecommendation,
  CATEGORY_SCOPE_CONFIG,
  type CategoryScopeKey,
  type RecommendationProjectFacts,
} from "@/lib/project-notification-recommendations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function requireAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user?.email) {
    return {
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      user: null,
    };
  }

  return { error: null, user };
}

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: projectRow, error: projectError } = await supabase
    .from("project_summary")
    .select("id, name, budget_hrs, qbo_total_hours, total_budget, total_spent, budget_materials, budget_design, budget_pm, budget_shipping, budget_id_labor, budget_travel, budget_props, budget_equipment, budget_rental, budget_crating, budget_flooring")
    .eq("id", id)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!projectRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: expenseRows, error: expenseError } = await supabase
    .from("expenses")
    .select("category, amount")
    .eq("project_id", id);

  if (expenseError) {
    return NextResponse.json({ error: expenseError.message }, { status: 500 });
  }

  const project = coerceProjectFacts(projectRow as Record<string, unknown>);
  const categoryActuals = buildCategoryActuals((expenseRows ?? []) as Array<{ category: string; amount: number | string | null }>);
  const recommendation = buildProjectNotificationRecommendation({
    requestText: message,
    project,
    categoryActuals,
  });

  return NextResponse.json({
    projectId: id,
    message,
    recommendation,
  });
}
