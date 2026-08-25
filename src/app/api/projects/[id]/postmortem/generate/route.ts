import Anthropic from "@anthropic-ai/sdk";
import { after, NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildPostMortemDataGaps, buildPostMortemLaborSummary } from "@/lib/project-postmortem";

export const maxDuration = 300;

async function generateAndSave(args: { supabase: any; runId: string; sourceSnapshot: unknown }) {
  const apiKey = process.env.ADA_LLM_API_KEY;
  if (!apiKey) throw new Error("Ada model credentials are not configured.");
  const client = new Anthropic({ apiKey });
  const result = await client.messages.create({
    model: process.env.ADA_POSTMORTEM_MODEL || process.env.ADA_VISION_MODEL || "claude-sonnet-4-6",
    max_tokens: 1800,
    system: "You create evidence-grounded project post-mortems. Call save_postmortem_draft exactly once. Never invent facts or causal claims. Treat calculated labor cost as incomplete when the snapshot says rates are missing.",
    messages: [{ role: "user", content: JSON.stringify(args.sourceSnapshot) }],
    tools: [{ name: "save_postmortem_draft", description: "Return the structured post-mortem draft.", input_schema: { type: "object", properties: { executive_summary: { type: "string" }, outcome: { type: "string", enum: ["on_target", "mixed", "overrun", "insufficient_data"] }, labor_assessment: { type: "string" }, materials_assessment: { type: "string" }, root_causes: { type: "array", items: { type: "object", additionalProperties: true } }, recommendations: { type: "array", items: { type: "object", additionalProperties: true } }, ada_lessons: { type: "array", items: { type: "object", additionalProperties: true } }, data_gaps: { type: "array", items: { type: "string" } } }, required: ["executive_summary", "outcome", "labor_assessment", "materials_assessment", "root_causes", "recommendations", "ada_lessons", "data_gaps"], additionalProperties: false } }],
    tool_choice: { type: "tool", name: "save_postmortem_draft" },
  });
  const tool = result.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "save_postmortem_draft");
  if (!tool?.input || typeof tool.input !== "object") throw new Error("Ada did not return a structured post-mortem draft.");
  const narrative = tool.input;
  const { data: saved, error } = await args.supabase.from("project_postmortems").update({ status: "draft", narrative, error_message: null }).eq("id", args.runId).select("id").single();
  if (error || !saved) throw new Error(error?.message ?? "Generated draft row was not updated.");
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
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
    const sourceSnapshot = { generated_at: new Date().toISOString(), project, labor_by_service_item: laborSummary, expense_summary: Object.values((expenses.data ?? []).reduce((groups: Record<string, { category: string; amount: number }>, entry: any) => { const category = entry.category ?? "Uncategorized"; groups[category] = groups[category] ?? { category, amount: 0 }; groups[category].amount += Number(entry.amount ?? 0); return groups; }, {})), issues: (issues.data ?? []).slice(0, 50), quote_lines: (lines.data ?? []).slice(0, 100), data_gaps: buildPostMortemDataGaps(laborSummary) };
    const { data: run, error: queueError } = await actor.supabase.from("project_postmortems").insert({ project_id: id, status: "generating", source_snapshot: sourceSnapshot, narrative: {}, generated_by: actor.actorEmail }).select("id").single();
    if (queueError || !run) return NextResponse.json({ error: queueError?.message ?? "Could not queue post-mortem generation." }, { status: 500 });
    const runId = run.id;
    console.log("[postmortem/generate] queued", id, runId);
    after(async () => {
      try {
        await generateAndSave({ supabase: actor.supabase, runId, sourceSnapshot });
        console.log("[postmortem/generate] complete", id, runId);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Unknown generation error";
        await actor.supabase.from("project_postmortems").update({ status: "failed", error_message: message }).eq("id", runId);
        console.error("[postmortem/generate] background failure", id, runId, message);
      }
    });
    return NextResponse.json({ id: runId, status: "generating" }, { status: 202 });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unknown generation error";
    console.error("[postmortem/generate] unexpected failure", message);
    return NextResponse.json({ error: `Post-mortem generation failed: ${message}` }, { status: 500 });
  }
}
