import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { buildBudgetPayloadFromProjectQuote, stripUnsupportedProjectFields } from "@/lib/project-rebaseline";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  const { data: project, error } = await supabase
    .from("projects")
    .select(`
      id,
      quote_materials,
      quote_design,
      quote_pm,
      quote_shipping,
      quote_id_labor,
      quote_travel,
      quote_props,
      quote_equipment,
      quote_rental,
      quote_flooring,
      pct_labor,
      pct_materials,
      pct_design,
      pct_pm,
      pct_shipping,
      pct_id_labor,
      pct_travel,
      pct_props,
      pct_equipment,
      pct_rental,
      pct_flooring
    `)
    .eq("id", id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const hasQuoteBasis = [
    project.quote_materials,
    project.quote_design,
    project.quote_pm,
    project.quote_shipping,
    project.quote_id_labor,
    project.quote_travel,
    project.quote_props,
    project.quote_equipment,
    project.quote_rental,
    project.quote_flooring,
  ].some((value) => Number(value ?? 0) > 0);

  if (!hasQuoteBasis) {
    return NextResponse.json({ error: "No stored quote data is available for rebaseline" }, { status: 400 });
  }

  const budgetPayload = stripUnsupportedProjectFields(
    buildBudgetPayloadFromProjectQuote(project)
  );

  const { error: updateError } = await supabase
    .from("projects")
    .update(budgetPayload)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, budgets: budgetPayload });
}
