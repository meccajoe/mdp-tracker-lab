import {
  buildFinancialReconciliationRow,
  buildReconciliationFingerprint,
  FinancialReconciliationRow,
} from "@/lib/financial-reconciliation";

export type FinancialReconciliationCaseState = {
  id: string;
  category: string;
  severity: string;
  status: string;
  ownerEmail: string | null;
  reason: string;
  nextAction: string;
  rowVersion: number;
  fingerprint: string;
  lastSeenAt: string;
  resolutionCode: string | null;
  resolutionNotes: string;
};

export type FinancialReconciliationQueueRow = FinancialReconciliationRow & {
  fingerprint: string;
  projectOwnerEmail: string | null;
  caseState: FinancialReconciliationCaseState | null;
};

type ProjectRow = {
  id: string;
  name: string;
  job_number: string | null;
  client: string;
  pm: string | null;
  status: string;
  contract_amount: number | string | null;
  total_spent: number | string | null;
  updated_at: string | null;
};

type QboMetricRow = {
  project_id: string;
  as_of_date: string;
  total_billed_to_date: number | string | null;
  total_cost_to_date: number | string | null;
  current_year_total_billings: number | string | null;
  current_year_costs: number | string | null;
  billing_source: string;
  cost_source: string;
  synced_at: string | null;
};

type LaborSummaryRow = {
  project_id: string;
  total_hours: number | string | null;
  verified_rate_hours: number | string | null;
  missing_rate_hours: number | string | null;
  verified_direct_wages: number | string | null;
  missing_rate_workers?: string[] | null;
};

type RoleRow = {
  pm_initials: string | null;
  full_name: string | null;
  email: string;
};

type CaseRow = {
  id: string;
  project_id: string;
  category: string;
  severity: string;
  status: string;
  owner_email: string | null;
  reason: string;
  next_action: string;
  row_version: number;
  fingerprint: string;
  last_seen_at: string;
  resolution_code: string | null;
  resolution_notes: string;
};

export type AssembleFinancialReconciliationInput = {
  asOfDate: string;
  projects: ProjectRow[];
  qboMetrics: QboMetricRow[];
  laborSummaries: LaborSummaryRow[];
  roleRows: RoleRow[];
  cases: CaseRow[];
  generatedAt?: string;
};

export type FinancialReconciliationPayload = {
  generatedAt: string;
  asOfDate: string;
  sourceFreshness: {
    sourceLabel: "QBO Project Profitability Summary";
    latestQboSyncAt: string | null;
    oldestQboSyncAt: string | null;
  };
  counts: {
    total: number;
    needsAction: number;
    waitingForFreshQbo: number;
    ready: number;
    missingRate: number;
    highOrCritical: number;
  };
  ownerOptions: Array<{ email: string; name: string; initials: string | null }>;
  rows: FinancialReconciliationQueueRow[];
};

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function caseState(row: CaseRow | undefined): FinancialReconciliationCaseState | null {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    status: row.status,
    ownerEmail: row.owner_email,
    reason: row.reason,
    nextAction: row.next_action,
    rowVersion: row.row_version,
    fingerprint: row.fingerprint,
    lastSeenAt: row.last_seen_at,
    resolutionCode: row.resolution_code,
    resolutionNotes: row.resolution_notes,
  };
}

export function assembleFinancialReconciliationPayload(input: AssembleFinancialReconciliationInput): FinancialReconciliationPayload {
  const qboByProject = new Map(input.qboMetrics.map((row) => [String(row.project_id), row]));
  const laborByProject = new Map(input.laborSummaries.map((row) => [String(row.project_id), row]));
  const ownerByInitials = new Map(
    input.roleRows
      .filter((row) => row.pm_initials && row.full_name)
      .map((row) => [String(row.pm_initials).toUpperCase(), row]),
  );
  const casesByProject = new Map<string, CaseRow>();
  const sortedCases = [...input.cases].sort((left, right) => {
    const leftActive = !["resolved", "superseded"].includes(left.status);
    const rightActive = !["resolved", "superseded"].includes(right.status);
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return String(right.last_seen_at).localeCompare(String(left.last_seen_at));
  });
  for (const row of sortedCases) {
    if (!casesByProject.has(String(row.project_id))) casesByProject.set(String(row.project_id), row);
  }

  const rows = input.projects.map<FinancialReconciliationQueueRow>((project) => {
    const qbo = qboByProject.get(String(project.id));
    const labor = laborByProject.get(String(project.id));
    const projectOwner = project.pm ? ownerByInitials.get(project.pm.toUpperCase()) : undefined;
    const metricRow = buildFinancialReconciliationRow({
      asOfDate: input.asOfDate,
      project: {
        projectId: String(project.id),
        projectName: project.name,
        jobNumber: project.job_number,
        client: project.client,
        owner: projectOwner?.full_name ?? project.pm ?? null,
        projectStatus: project.status,
        contractAmount: numberOrNull(project.contract_amount),
        trackerExpenses: numberOrNull(project.total_spent) ?? 0,
        trackerEvidenceUpdatedAt: project.updated_at,
      },
      labor: {
        totalHours: numberOrNull(labor?.total_hours) ?? 0,
        verifiedRateHours: numberOrNull(labor?.verified_rate_hours) ?? 0,
        missingRateHours: numberOrNull(labor?.missing_rate_hours) ?? 0,
        verifiedDirectWages: numberOrNull(labor?.verified_direct_wages) ?? 0,
        missingRateWorkers: labor?.missing_rate_workers ?? [],
      },
      qbo: qbo
        ? {
            asOfDate: qbo.as_of_date,
            totalBilledToDate: numberOrNull(qbo.total_billed_to_date),
            totalCostToDate: numberOrNull(qbo.total_cost_to_date),
            currentYearBillings: numberOrNull(qbo.current_year_total_billings),
            currentYearCosts: numberOrNull(qbo.current_year_costs),
            syncedAt: qbo.synced_at,
            billingSource: qbo.billing_source,
            costSource: qbo.cost_source,
          }
        : null,
    });
    return {
      ...metricRow,
      fingerprint: buildReconciliationFingerprint(metricRow),
      projectOwnerEmail: projectOwner?.email ?? null,
      caseState: caseState(casesByProject.get(String(project.id))),
    };
  });

  rows.sort((left, right) => {
    const queueOrder = { needs_action: 0, waiting_for_fresh_qbo: 1, ready: 2 };
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return queueOrder[left.queueStatus] - queueOrder[right.queueStatus]
      || severityOrder[left.severity] - severityOrder[right.severity]
      || Math.max(Math.abs(right.costVariance.amount ?? 0), Math.abs(right.revenueVariance.amount ?? 0))
        - Math.max(Math.abs(left.costVariance.amount ?? 0), Math.abs(left.revenueVariance.amount ?? 0));
  });

  const qboSyncs = input.qboMetrics.map((row) => row.synced_at).filter((value): value is string => Boolean(value)).sort();
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    asOfDate: input.asOfDate,
    sourceFreshness: {
      sourceLabel: "QBO Project Profitability Summary",
      latestQboSyncAt: qboSyncs.at(-1) ?? null,
      oldestQboSyncAt: qboSyncs[0] ?? null,
    },
    counts: {
      total: rows.length,
      needsAction: rows.filter((row) => row.queueStatus === "needs_action").length,
      waitingForFreshQbo: rows.filter((row) => row.queueStatus === "waiting_for_fresh_qbo").length,
      ready: rows.filter((row) => row.queueStatus === "ready").length,
      missingRate: rows.filter((row) => row.laborCoverage.missingRateHours > 0).length,
      highOrCritical: rows.filter((row) => row.severity === "high" || row.severity === "critical").length,
    },
    ownerOptions: input.roleRows
      .filter((row) => row.full_name)
      .map((row) => ({ email: row.email, name: row.full_name!, initials: row.pm_initials }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    rows,
  };
}

export async function loadFinancialReconciliationPayload(
  supabase: any,
  asOfDate: string,
): Promise<FinancialReconciliationPayload> {
  const [projects, qboMetrics, laborSummaries, roleRows, cases] = await Promise.all([
    supabase.from("project_summary").select("id,name,job_number,client,pm,status,contract_amount,total_spent,updated_at").order("id"),
    supabase.from("qbo_project_wip_metrics").select("project_id,as_of_date,total_billed_to_date,total_cost_to_date,current_year_total_billings,current_year_costs,billing_source,cost_source,synced_at").eq("as_of_date", asOfDate),
    supabase.from("project_labor_reconciliation_summary").select("project_id,total_hours,verified_rate_hours,missing_rate_hours,verified_direct_wages,missing_rate_workers"),
    supabase.from("user_roles").select("pm_initials,full_name,email"),
    supabase.from("financial_reconciliation_cases").select("id,project_id,category,severity,status,owner_email,reason,next_action,row_version,fingerprint,last_seen_at,resolution_code,resolution_notes").neq("status", "superseded").order("last_seen_at", { ascending: false }),
  ]);
  const error = projects.error ?? qboMetrics.error ?? laborSummaries.error ?? roleRows.error ?? cases.error;
  if (error) throw new Error(error.message);

  return assembleFinancialReconciliationPayload({
    asOfDate,
    projects: projects.data ?? [],
    qboMetrics: qboMetrics.data ?? [],
    laborSummaries: laborSummaries.data ?? [],
    roleRows: roleRows.data ?? [],
    cases: cases.data ?? [],
  });
}
