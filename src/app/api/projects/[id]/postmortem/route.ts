import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { assessPostmortemFreshness } from "@/lib/project-postmortem-freshness";
import { buildPostMortemLaborEvidence, type PostMortemLaborEntry } from "@/lib/project-postmortem";
import { fetchAllPostmortemSourceRows } from "@/lib/postmortem-source-pagination";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireProjectAdmin(request); if (!actor.ok) return actor.response;
  const { id } = await context.params;
  const { data, error } = await actor.supabase.from("project_postmortems").select("*").eq("project_id", id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ postmortem: null, freshness: null });
  const [labor, expenses, issues, lines] = await Promise.all([
    fetchAllPostmortemSourceRows<PostMortemLaborEntry>((from, to) => actor.supabase.from("qbo_labor_entries").select("qbo_entry_id,employee_name,service_item,reg_hours,ot_hours,hourly_rate,rate_source,rate_verified_at").eq("project_id", id).like("qbo_entry_id", "ts_%").order("id", { ascending: true }).range(from, to)),
    actor.supabase.from("expenses").select("id,vendor,category,amount,date,notes").eq("project_id", id),
    actor.supabase.from("production_issues").select("id,category,severity,title,description,status,reported_date").eq("project_id", id),
    actor.supabase.from("quote_line_items").select("id,sku,description,quantity,line_total,source_date").eq("project_id", id),
  ]);
  const sourceError = expenses.error ?? issues.error ?? lines.error;
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  const current = { labor: buildPostMortemLaborEvidence(labor.rows), expenses: expenses.data ?? [], issues: issues.data ?? [], quote_lines: lines.data ?? [] };
  return NextResponse.json({ postmortem: data, freshness: assessPostmortemFreshness(data.source_snapshot ?? {}, current) });
}
