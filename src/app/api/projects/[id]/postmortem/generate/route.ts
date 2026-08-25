import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildPostMortemDataGaps, buildPostMortemLaborSummary } from "@/lib/project-postmortem";
import { selectAdaModel } from "@/lib/ada-model-policy";

export const maxDuration = 300;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return await generatePostmortem(request, context); } catch (reason) { const message = reason instanceof Error ? reason.message : "Unknown generation error"; console.error("[postmortem/generate] unexpected failure", message); return NextResponse.json({ error: `Post-mortem generation failed: ${message}` }, { status: 500 }); }
}

async function generatePostmortem(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireProjectAdmin(); if (!actor.ok) return actor.response;
  const { id } = await context.params;
  const { data: project, error } = await actor.supabase.from("projects").select("id,name,job_number,client,pm,status,close_date,due_date,contract_amount,budget_hrs,budget_materials,quote_materials,notes").eq("id", id).single();
  if (error || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status !== "Completed") return NextResponse.json({ error: "Post-mortems are available only for completed projects." }, { status: 400 });
  const [labor, expenses, issues, lines] = await Promise.all([
    actor.supabase.from("qbo_labor_entries").select("qbo_entry_id,service_item,reg_hours,ot_hours,hourly_rate").eq("project_id", id),
    actor.supabase.from("expenses").select("id,vendor,category,amount,date,notes").eq("project_id", id),
    actor.supabase.from("production_issues").select("id,category,severity,title,description,status,reported_date").eq("project_id", id),
    actor.supabase.from("quote_line_items").select("id,sku,description,quantity,line_total,source_date").eq("project_id", id),
  ]);
  const sourceErrors = [labor.error, expenses.error, issues.error, lines.error].filter(Boolean); if (sourceErrors.length) return NextResponse.json({ error: sourceErrors[0]?.message }, { status: 500 });
  const laborSummary = buildPostMortemLaborSummary(labor.data ?? []);
  const sourceSnapshot = { generated_at: new Date().toISOString(), project, labor_by_service_item: laborSummary, expenses: expenses.data ?? [], issues: issues.data ?? [], quote_lines: lines.data ?? [], data_gaps: buildPostMortemDataGaps(laborSummary) };
  const apiKey = process.env.ADA_LLM_API_KEY; if (!apiKey) return NextResponse.json({ error: "Ada model credentials are not configured." }, { status: 503 });
  const client = new Anthropic({ apiKey });
  let result: Anthropic.Message;
  try {
    result = await client.messages.create({ model: selectAdaModel({ purpose: "conversation", complexity: "standard", lowConfidence: false }), max_tokens: 1800, system: "You create evidence-grounded project post-mortems. Return valid JSON only with executive_summary, outcome (on_target|mixed|overrun|insufficient_data), labor_assessment, materials_assessment, root_causes (array of {finding,confidence,evidence}), recommendations (array of {owner,priority,recommendation,evidence}), ada_lessons (array of {condition,lesson,recommendation,confidence,evidence}), and data_gaps. Never invent facts or causal claims. Treat calculated labor cost as incomplete when the snapshot says rates are missing.", messages: [{ role: "user", content: JSON.stringify(sourceSnapshot) }] });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unknown model error";
    console.error("[postmortem/generate] model request failed", message);
    return NextResponse.json({ error: `Ada generation failed: ${message}` }, { status: 502 });
  }
  const text = result.content.filter((block): block is Anthropic.TextBlock => block.type === "text").map((block) => block.text).join("").trim();
  let narrative: unknown; try { narrative = JSON.parse(text); } catch { return NextResponse.json({ error: "Ada returned an invalid post-mortem draft." }, { status: 502 }); }
  const { data: postmortem, error: saveError } = await actor.supabase.from("project_postmortems").insert({ project_id: id, source_snapshot: sourceSnapshot, narrative, generated_by: actor.actorEmail }).select("*").single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  return NextResponse.json({ postmortem }, { status: 201 });
}
