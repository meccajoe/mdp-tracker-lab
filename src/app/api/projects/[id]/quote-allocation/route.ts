import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getDealQuote, getQuoteLineItems } from "@/lib/hubspot";
import { mapLineItemToQuoteCategory } from "@/lib/hubspot-quote-parser";
import { buildQuoteLineBudgetAllocationRows, type QuoteBackedProject } from "@/lib/project-rebaseline";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  const { data: project, error } = await supabase
    .from("projects")
    .select(`
      id,
      name,
      contract_amount,
      hubspot_deal_id,
      hubspot_quote_id,
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

  if (!project.hubspot_deal_id) {
    return NextResponse.json({ error: "Project is missing a HubSpot deal link" }, { status: 400 });
  }

  try {
    const quoteId = await getDealQuote(
      String(project.hubspot_deal_id),
      project.name ?? undefined,
      project.hubspot_quote_id,
    );
    if (!quoteId) {
      return NextResponse.json({ error: "No HubSpot quote found for this project" }, { status: 404 });
    }

    const lineItems = await getQuoteLineItems(quoteId);
    const { data: localLines } = await supabase.from("quote_line_items").select("id,source_id").eq("project_id", id).eq("source", "hubspot");
    const localBySource = new Map((localLines ?? []).map((line: any) => [line.source_id, line.id]));
    const localIds = (localLines ?? []).map((line: any) => line.id);
    const { data: overrides } = localIds.length ? await supabase.from("quote_line_formula_overrides").select("quote_line_item_id,square_feet").in("quote_line_item_id", localIds) : { data: [] };
    const overrideByLocalId = new Map((overrides ?? []).map((override: any) => [override.quote_line_item_id, override]));
    const allocationRows = buildQuoteLineBudgetAllocationRows(
      project as QuoteBackedProject,
      lineItems.map((item) => ({
        source_line_item_id: item.id ?? `${item.sku}-${item.name}`,
        sku: item.sku,
        item: item.name,
        description: `${item.description ?? ""}${overrideByLocalId.get(localBySource.get(item.id ?? ""))?.square_feet ? ` SQFT: ${overrideByLocalId.get(localBySource.get(item.id ?? ""))?.square_feet}` : ""}`,
        quantity: item.quantity ?? 0,
        unit_price: item.unit_price ?? 0,
        line_total: item.amount,
        mapped_category: mapLineItemToQuoteCategory(item),
      }))
    );

    const totals = allocationRows.reduce(
      (acc, row) => {
        acc.line_total += row.line_total;
        acc.labor_hours += row.labor_hours;
        acc.labor_budget += row.labor_budget;
        acc.material_budget += row.material_budget;
        acc.non_lm_budget += row.non_lm_budget;
        return acc;
      },
      { line_total: 0, labor_hours: 0, labor_budget: 0, material_budget: 0, non_lm_budget: 0 }
    );

    return NextResponse.json({
      ok: true,
      quote_id: quoteId,
      rows: allocationRows,
      totals,
    });
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : "Failed to load quote allocation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
