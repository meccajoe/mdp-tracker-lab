import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { canonicalLaborCostQueryFilter } from "@/lib/labor-rate-source";

export async function GET(request: NextRequest) {
  const actor = await requireProjectAdmin();
  if (!actor.ok) return actor.response;
  const start = request.nextUrl.searchParams.get("start") ?? "2000-01-01";
  const end = request.nextUrl.searchParams.get("end") ?? "2100-01-01";
  const rateSourceFilter = canonicalLaborCostQueryFilter();
  const [labor, projects, drafts] = await Promise.all([
    actor.supabase.from("qbo_labor_entries").select("qbo_entry_id,project_id,employee_name,date,reg_hours,ot_hours,hourly_rate").like(rateSourceFilter.column, rateSourceFilter.value).gte("date", start).lte("date", end).order("date", { ascending: false }),
    actor.supabase.from("projects").select("id,name,job_number,status").order("id"),
    actor.supabase.from("labor_reclass_drafts").select("*").order("created_at", { ascending: false }),
  ]);
  const error = labor.error ?? projects.error ?? drafts.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ labor: labor.data ?? [], projects: projects.data ?? [], drafts: drafts.data ?? [] });
}

export async function POST(request: NextRequest) {
  const actor = await requireProjectAdmin();
  if (!actor.ok) return actor.response;
  const body = await request.json().catch(() => ({})) as { periodStart?: string; periodEnd?: string; targetProjectId?: string; sourceProjectId?: string | null; amount?: number; memo?: string; entryIds?: string[] };
  if (!body.periodStart || !body.periodEnd || !body.targetProjectId || !Number.isFinite(body.amount) || body.amount! <= 0 || !body.entryIds?.length) return NextResponse.json({ error: "Period, target project, amount, and labor entries are required." }, { status: 400 });
  const { data: draft, error } = await actor.supabase.from("labor_reclass_drafts").insert({ period_start: body.periodStart, period_end: body.periodEnd, target_project_id: body.targetProjectId, source_project_id: body.sourceProjectId ?? null, amount: body.amount, memo: body.memo?.trim() ?? "", created_by: actor.actorEmail }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: linkError } = await actor.supabase.from("labor_reclass_draft_entries").insert(body.entryIds.map((qbo_entry_id) => ({ draft_id: draft.id, qbo_entry_id })));
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  return NextResponse.json({ draft }, { status: 201 });
}
