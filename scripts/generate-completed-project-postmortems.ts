import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { buildPostMortemDataGaps, buildPostMortemLaborEvidence, type PostMortemLaborEntry } from "../src/lib/project-postmortem";
import { fetchAllPostmortemSourceRows } from "../src/lib/postmortem-source-pagination";

const BATCH_CONCURRENCY = Math.max(1, Number(process.env.BATCH_CONCURRENCY ?? 2));
const BATCH_DELAY_MS = Math.max(0, Number(process.env.BATCH_DELAY_MS ?? 1000));
const SETTLED_STATUSES = new Set(["draft", "reviewed", "approved"]);
const STALE_AFTER_MS = 30 * 60 * 1000;
const actor = process.env.POSTMORTEM_BATCH_ACTOR ?? "system:postmortem-batch";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dryRun = process.argv.includes("--dry-run");
const regenerateAffected = process.argv.includes("--regenerate-affected");
const limit = option("--limit") ? Math.max(1, Number(option("--limit"))) : undefined;
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.ADA_LLM_API_KEY;
if (!supabaseUrl || !serviceKey || !apiKey) throw new Error("Supabase and Ada model credentials are required.");

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const anthropic = new Anthropic({ apiKey });

const postmortemTool: Anthropic.Tool = {
  name: "save_postmortem_draft",
  description: "Return the structured post-mortem draft.",
  input_schema: {
    type: "object",
    properties: {
      executive_summary: { type: "string" },
      outcome: { type: "string", enum: ["on_target", "mixed", "overrun", "insufficient_data"] },
      labor_assessment: { type: "string" },
      materials_assessment: { type: "string" },
      root_causes: { type: "array", items: { type: "object", additionalProperties: true } },
      recommendations: { type: "array", items: { type: "object", additionalProperties: true } },
      ada_lessons: { type: "array", items: { type: "object", additionalProperties: true } },
      data_gaps: { type: "array", items: { type: "string" } },
    },
    required: ["executive_summary", "outcome", "labor_assessment", "materials_assessment", "root_causes", "recommendations", "ada_lessons", "data_gaps"],
    additionalProperties: false,
  },
};

async function buildSource(project: Record<string, unknown>) {
  const id = String(project.id);
  const [labor, expenses, issues, lines] = await Promise.all([
    fetchAllPostmortemSourceRows<PostMortemLaborEntry>((from, to) => supabase.from("qbo_labor_entries").select("qbo_entry_id,employee_name,service_item,reg_hours,ot_hours,hourly_rate,rate_source,rate_verified_at").eq("project_id", id).like("qbo_entry_id", "ts_%").order("id", { ascending: true }).range(from, to)),
    supabase.from("expenses").select("id,vendor,category,amount,date,notes").eq("project_id", id),
    supabase.from("production_issues").select("id,category,severity,title,description,status,reported_date").eq("project_id", id),
    supabase.from("quote_line_items").select("id,sku,description,quantity,line_total,source_date").eq("project_id", id),
  ]);
  const sourceError = expenses.error ?? issues.error ?? lines.error;
  if (sourceError) throw new Error(sourceError.message);
  const laborEvidence = buildPostMortemLaborEvidence(labor.rows);
  const expenseSummary = Object.values((expenses.data ?? []).reduce((groups: Record<string, { category: string; amount: number }>, entry) => {
    const category = entry.category ?? "Uncategorized";
    groups[category] = groups[category] ?? { category, amount: 0 };
    groups[category].amount += Number(entry.amount ?? 0);
    return groups;
  }, {}));
  return {
    generated_at: new Date().toISOString(),
    project,
    labor: laborEvidence,
    source_integrity: { labor_row_count: labor.rows.length, labor_page_count: labor.pageCount, complete: labor.complete },
    expense_summary: expenseSummary,
    issues: (issues.data ?? []).slice(0, 50),
    quote_lines: (lines.data ?? []).slice(0, 100),
    data_gaps: buildPostMortemDataGaps(laborEvidence),
  };
}

async function callModel(sourceSnapshot: unknown) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await anthropic.messages.create({
        model: process.env.ADA_POSTMORTEM_MODEL || process.env.ADA_VISION_MODEL || "claude-sonnet-4-6",
        max_tokens: 1800,
        system: "You create evidence-grounded project post-mortems. Call save_postmortem_draft exactly once. Never invent facts or causal claims. When labor.rate_coverage.complete is true, treat calculated_base_wage_cost as verified direct base wage cost from QBO Time employee pay rates and do not claim individual pay rates are missing or unconfirmed. Never call it fully loaded or GL-reconciled labor cost. Respect every explicit data gap. If evidence is sparse, use insufficient_data and recommendations focused on data capture.",
        messages: [{ role: "user", content: JSON.stringify(sourceSnapshot) }],
        tools: [postmortemTool],
        tool_choice: { type: "tool", name: "save_postmortem_draft" },
      });
      const tool = result.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "save_postmortem_draft");
      if (!tool?.input || typeof tool.input !== "object") throw new Error("Ada did not return a structured post-mortem draft.");
      return tool.input;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 3000);
    }
  }
  throw lastError;
}

async function generate(project: Record<string, unknown>) {
  const projectId = String(project.id);
  const sourceSnapshot = await buildSource(project);
  const queued = await supabase.from("project_postmortems").insert({ project_id: projectId, status: "generating", source_snapshot: sourceSnapshot, narrative: {}, generated_by: actor }).select("id").single();
  if (queued.error || !queued.data) throw new Error(queued.error?.message ?? "Could not persist generation state.");
  const runId = queued.data.id;
  try {
    const narrative = await callModel(sourceSnapshot);
    const saved = await supabase.from("project_postmortems").update({ status: "draft", narrative, error_message: null }).eq("id", runId).select("id").single();
    if (saved.error || !saved.data) throw new Error(saved.error?.message ?? "Could not save generated draft.");
    return { projectId, runId, status: "draft" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("project_postmortems").update({ status: "failed", error_message: message }).eq("id", runId);
    return { projectId, runId, status: "failed" as const, error: message };
  }
}

async function main() {
  const projectsResult = await supabase.from("projects").select("id,name,job_number,client,pm,status,close_date,due_date,contract_amount,budget_hrs,budget_materials,quote_materials,notes").eq("status", "Completed").order("id");
  if (projectsResult.error) throw new Error(projectsResult.error.message);
  const runsResult = await supabase.from("project_postmortems").select("id,project_id,status,generated_at,source_snapshot").order("generated_at", { ascending: false });
  if (runsResult.error) throw new Error(runsResult.error.message);

  const settled = new Set((runsResult.data ?? []).filter((run) => SETTLED_STATUSES.has(run.status)).map((run) => run.project_id));
  const freshRunning = new Set((runsResult.data ?? []).filter((run) => run.status === "generating" && Date.now() - new Date(run.generated_at).getTime() < STALE_AFTER_MS).map((run) => run.project_id));
  const stale = (runsResult.data ?? []).filter((run) => run.status === "generating" && !freshRunning.has(run.project_id));
  for (const run of stale) await supabase.from("project_postmortems").update({ status: "failed", error_message: "Batch resumed after stale generation state." }).eq("id", run.id);

  const latestByProject = new Map<string, any>();
  for (const run of runsResult.data ?? []) if (!latestByProject.has(run.project_id)) latestByProject.set(run.project_id, run);
  const affected = new Set([...latestByProject.entries()].filter(([, run]) => {
    const evidence = run.source_snapshot?.labor?.employee_rate_evidence ?? [];
    return evidence.some((row: any) => Number(row.hourly_rate) > 0 && !String(row.rate_source ?? "").startsWith("qbo_time_users"));
  }).map(([projectId]) => projectId));
  let candidates = (projectsResult.data ?? []).filter((project) => !freshRunning.has(project.id) && (regenerateAffected ? affected.has(project.id) : !settled.has(project.id)));
  if (limit) candidates = candidates.slice(0, limit);
  const summary = { completed: projectsResult.data?.length ?? 0, alreadySettled: settled.size, alreadyRunning: freshRunning.size, affected: affected.size, candidates: candidates.length, generated: 0, failed: 0 };
  if (dryRun) return console.log(JSON.stringify({ dryRun: true, summary, projectIds: candidates.map((project) => project.id) }, null, 2));

  let cursor = 0;
  async function worker(workerId: number) {
    while (cursor < candidates.length) {
      const project = candidates[cursor++];
      const result = await generate(project);
      if (result.status === "draft") summary.generated += 1;
      else summary.failed += 1;
      console.log(JSON.stringify({ workerId, ...result, progress: summary.generated + summary.failed, total: candidates.length }));
      if (BATCH_DELAY_MS) await sleep(BATCH_DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, candidates.length) }, (_, index) => worker(index + 1)));
  console.log(JSON.stringify({ summary }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(JSON.stringify({ fatal: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });
