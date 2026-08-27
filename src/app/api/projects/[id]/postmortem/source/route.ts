import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildPostMortemDataGaps, buildPostMortemLaborEvidence, type PostMortemLaborEntry } from "@/lib/project-postmortem";
import { fetchAllPostmortemSourceRows } from "@/lib/postmortem-source-pagination";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireProjectAdmin(); if (!actor.ok) return actor.response;
  const { id } = await context.params;
  const { data: project, error } = await actor.supabase.from("projects").select("id,name,job_number,client,pm,status,close_date,due_date,contract_amount,budget_hrs,budget_materials,quote_materials,notes").eq("id", id).single();
  if (error || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status !== "Completed") return NextResponse.json({ error: "Post-mortems are available only for completed projects." }, { status: 400 });
  const [labor, expenses, issues, lines] = await Promise.all([
    fetchAllPostmortemSourceRows<PostMortemLaborEntry>((from, to) => actor.supabase.from("qbo_labor_entries").select("qbo_entry_id,employee_name,service_item,reg_hours,ot_hours,hourly_rate,rate_source,rate_verified_at").eq("project_id", id).like("qbo_entry_id", "ts_%").order("id", { ascending: true }).range(from, to)),
    actor.supabase.from("expenses").select("id,vendor,category,amount,date,notes").eq("project_id", id),
    actor.supabase.from("production_issues").select("id,category,severity,title,description,status,reported_date").eq("project_id", id),
    actor.supabase.from("quote_line_items").select("id,sku,description,quantity,line_total,source_date").eq("project_id", id),
  ]);
  const sourceErrors = [expenses.error, issues.error, lines.error].filter(Boolean);
  if (sourceErrors.length) return NextResponse.json({ error: sourceErrors[0]?.message }, { status: 500 });
  const laborEvidence = buildPostMortemLaborEvidence(labor.rows);
  return NextResponse.json({
    project,
    source_snapshot: {
      generated_at: new Date().toISOString(),
      labor: laborEvidence,
      source_integrity: { labor_row_count: labor.rows.length, labor_page_count: labor.pageCount, complete: labor.complete },
      expenses: expenses.data ?? [],
      issues: issues.data ?? [],
      quote_lines: lines.data ?? [],
      data_gaps: buildPostMortemDataGaps(laborEvidence),
    },
  });
}
