import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";

try {
  loadEnvFile(".env.local");
} catch {
  // Production runners may provide environment variables directly.
}

type ProjectRow = {
  id: string;
  name: string;
  job_number: string | null;
  pm: string | null;
  status: string | null;
  bill_budget_uuid: string | null;
  bill_job_name_snapshot: string | null;
  budget_travel: number | null;
  budget_props: number | null;
};

type RoleRow = {
  pm_initials: string | null;
  email: string | null;
  bill_spend_email: string | null;
};

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply");
const repairLinked = args.has("--repair-linked");
const projectArg = process.argv.find((arg) => arg.startsWith("--project="))?.slice("--project=".length) ?? null;
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
const limit = limitArg ? Number(limitArg) : null;
if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) throw new Error("--limit must be a positive integer");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase backfill configuration");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function listAllProjects(): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,job_number,pm,status,bill_budget_uuid,bill_job_name_snapshot,budget_travel,budget_props")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Tracker project scan failed: ${error.message}`);
    const page = (data ?? []) as ProjectRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const [{
    buildBillBudgetName,
    calculateBillManagedBudgetTotal,
    isBillBudgetLinkSuccess,
    resolveBillSpendMemberEmail,
    seedBillBudgetForProject,
    updateBillBudgetForProject,
  }, projects, rolesResult] = await Promise.all([
    import("../src/lib/billcom-budget"),
    listAllProjects(),
    supabase.from("user_roles").select("pm_initials,email,bill_spend_email"),
  ]);
  if (rolesResult.error) throw new Error(`Tracker PM directory scan failed: ${rolesResult.error.message}`);
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const roleByPm = new Map(roles.filter((row) => row.pm_initials).map((row) => [row.pm_initials!, row]));

  const activeProjects = projects.filter((project) => project.status === "Active");
  let candidates = activeProjects.filter((project) => !project.bill_budget_uuid);
  if (repairLinked && projectArg) candidates = activeProjects.filter((project) => project.id === projectArg);
  if (projectArg) candidates = candidates.filter((project) => project.id === projectArg);
  if (limit !== null) candidates = candidates.slice(0, limit);

  const summary = {
    dryRun,
    repairLinked,
    scanned: projects.length,
    active: activeProjects.length,
    inactiveExcluded: projects.length - activeProjects.length,
    alreadyLinked: activeProjects.filter((project) => Boolean(project.bill_budget_uuid)).length,
    candidates: candidates.length,
    created: 0,
    attached: 0,
    failed: 0,
    outcomes: [] as Array<{ projectId: string; status: string; budgetTotal?: number; budgetUuid?: string; error?: string }>,
  };

  if (dryRun) {
    summary.outcomes = candidates.map((project) => ({
      projectId: project.id,
      status: "would_reconcile",
      budgetTotal: calculateBillManagedBudgetTotal(project),
    }));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const project of candidates) {
    const jobNumber = project.job_number ?? project.id;
    const budgetName = buildBillBudgetName({
      billJobName: project.bill_job_name_snapshot,
      jobNumber,
      projectName: project.name,
    });
    const pmEmail = resolveBillSpendMemberEmail(project.pm ? roleByPm.get(project.pm) : null);
    const budgetInput = {
      projectId: project.id,
      projectName: project.name,
      jobNumber,
      billJobName: budgetName,
      budgetTravel: project.budget_travel ?? 0,
      budgetProps: project.budget_props ?? 0,
      pmEmail,
    };
    const result = project.bill_budget_uuid
      ? await updateBillBudgetForProject({ ...budgetInput, budgetUuid: project.bill_budget_uuid })
      : await seedBillBudgetForProject(budgetInput);
    const success = isBillBudgetLinkSuccess(result.status) && Boolean(result.budgetUuid);
    const updatePayload = success ? {
      bill_budget_uuid: result.budgetUuid!,
      bill_budget_name: result.budgetName ?? budgetName,
      bill_budget_seeded_at: new Date().toISOString(),
      bill_budget_seed_source: "existing_project_backfill",
      bill_budget_last_sync_status: result.status,
      bill_budget_last_sync_error: result.error ?? null,
      bill_job_name_snapshot: budgetName,
      bill_budget_total_snapshot: calculateBillManagedBudgetTotal(project),
    } : {
      bill_budget_last_sync_status: result.status,
      bill_budget_last_sync_error: result.error ?? "bill_budget_backfill_missing_uuid",
      bill_job_name_snapshot: budgetName,
      bill_budget_total_snapshot: calculateBillManagedBudgetTotal(project),
    };
    const { error: updateError } = await supabase.from("projects").update(updatePayload).eq("id", project.id);
    if (updateError || !success) {
      summary.failed += 1;
      summary.outcomes.push({
        projectId: project.id,
        status: "failed",
        error: updateError?.message ?? result.error ?? "bill_budget_backfill_missing_uuid",
      });
    } else {
      if (result.status.startsWith("attached")) summary.attached += 1;
      else summary.created += 1;
      summary.outcomes.push({
        projectId: project.id,
        status: result.status,
        budgetUuid: result.budgetUuid,
        error: result.error,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
