import { createHash } from "node:crypto";

export const FINANCIAL_RECONCILIATION_CONTRACT_VERSION = "2026-09-17.v1";
export const VARIANCE_ABSOLUTE_THRESHOLD = 500;
export const VARIANCE_PERCENT_THRESHOLD = 5;

export type ReconciliationCategory =
  | "stale_qbo_data"
  | "missing_qbo_actuals"
  | "missing_tracker_contract"
  | "missing_labor_rate"
  | "revenue_variance"
  | "cost_variance"
  | "within_tolerance";

export type ReconciliationQueueStatus = "needs_action" | "waiting_for_fresh_qbo" | "ready";
export type ReconciliationSeverity = "low" | "medium" | "high" | "critical";
export type ReconciliationFreshness = "fresh" | "stale" | "never_synced";

type ProjectInput = {
  projectId: string;
  projectName: string;
  jobNumber: string | null;
  client: string;
  owner: string | null;
  projectStatus: string;
  contractAmount: number | null;
  trackerExpenses: number;
  trackerEvidenceUpdatedAt: string | null;
};

type LaborInput = {
  totalHours: number;
  verifiedRateHours: number;
  missingRateHours: number;
  verifiedDirectWages: number;
};

type QboInput = {
  asOfDate: string;
  totalBilledToDate: number | null;
  totalCostToDate: number | null;
  currentYearBillings: number | null;
  currentYearCosts: number | null;
  syncedAt: string | null;
  billingSource: string;
  costSource: string;
};

export type FinancialReconciliationInput = {
  asOfDate: string;
  project: ProjectInput;
  labor: LaborInput;
  qbo: QboInput | null;
};

export type ReconciliationReason = {
  code: ReconciliationCategory;
  message: string;
};

export type FinancialReconciliationRow = {
  contractVersion: string;
  asOfDate: string;
  project: {
    id: string;
    name: string;
    jobNumber: string | null;
    client: string;
    owner: string | null;
    status: string;
  };
  tracker: {
    contractAmount: number | null;
    expenses: number;
    verifiedDirectWages: number;
    operationalCost: number;
    operationalGrossProfit: number | null;
    evidenceUpdatedAt: string | null;
    sourceLabel: "Tracker operational evidence";
  };
  qbo: {
    totalBilledToDate: number | null;
    totalCostToDate: number | null;
    netIncome: number | null;
    currentYearBillings: number | null;
    currentYearCosts: number | null;
    syncedAt: string | null;
    sourceLabel: "QBO Project Profitability Summary";
    billingSource: string | null;
    costSource: string | null;
  };
  laborCoverage: {
    totalHours: number;
    verifiedRateHours: number;
    missingRateHours: number;
    status: "complete" | "missing_rate" | "no_labor";
  };
  revenueVariance: ReconciliationVariance;
  costVariance: ReconciliationVariance;
  freshness: {
    status: ReconciliationFreshness;
    qboAsOfDate: string | null;
    qboSyncedAt: string | null;
  };
  category: ReconciliationCategory;
  queueStatus: ReconciliationQueueStatus;
  severity: ReconciliationSeverity;
  reviewReasons: ReconciliationReason[];
  reason: string;
  nextAction: string;
};

export type ReconciliationVariance = {
  amount: number | null;
  percent: number | null;
  material: boolean;
  direction: "qbo_higher" | "tracker_higher" | "even" | "unknown";
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function quantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function variance(qboValue: number | null, trackerValue: number | null): ReconciliationVariance {
  if (qboValue == null || trackerValue == null) {
    return { amount: null, percent: null, material: false, direction: "unknown" };
  }

  const amount = money(qboValue - trackerValue);
  const percent = trackerValue === 0 ? null : quantity((Math.abs(amount) / Math.abs(trackerValue)) * 100);
  return {
    amount,
    percent,
    material: Math.abs(amount) > VARIANCE_ABSOLUTE_THRESHOLD || (percent != null && percent > VARIANCE_PERCENT_THRESHOLD),
    direction: amount > 0 ? "qbo_higher" : amount < 0 ? "tracker_higher" : "even",
  };
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

function buildSeverity(input: {
  category: ReconciliationCategory;
  revenueVariance: ReconciliationVariance;
  costVariance: ReconciliationVariance;
  missingRateHours: number;
}): ReconciliationSeverity {
  if (input.category === "missing_qbo_actuals") return "high";
  const largestVariance = Math.max(
    Math.abs(input.revenueVariance.amount ?? 0),
    Math.abs(input.costVariance.amount ?? 0),
  );
  if (largestVariance > 10_000) return "critical";
  if (largestVariance > 5_000) return "high";
  if (input.missingRateHours >= 20) return "high";
  if (largestVariance > VARIANCE_ABSOLUTE_THRESHOLD || input.missingRateHours > 0 || input.category === "stale_qbo_data") return "medium";
  return "low";
}

function reasonForVariance(label: "Revenue" | "Cost", value: ReconciliationVariance): string {
  if (value.amount == null) return `${label} cannot be compared because one source is missing.`;
  if (value.direction === "even") return `${label} matches between QBO and Tracker.`;
  return `QBO ${label.toLowerCase()} is ${currency(value.amount)} ${value.amount > 0 ? "above" : "below"} Tracker.`;
}

export function buildFinancialReconciliationRow(input: FinancialReconciliationInput): FinancialReconciliationRow {
  const expenses = money(Number(input.project.trackerExpenses) || 0);
  const directWages = money(Number(input.labor.verifiedDirectWages) || 0);
  const operationalCost = money(expenses + directWages);
  const operationalGrossProfit = input.project.contractAmount == null
    ? null
    : money(input.project.contractAmount - operationalCost);
  const qboIncome = input.qbo?.totalBilledToDate ?? null;
  const qboCost = input.qbo?.totalCostToDate ?? null;
  const qboNetIncome = qboIncome == null || qboCost == null ? null : money(qboIncome - qboCost);
  const revenueVariance = variance(qboIncome, input.project.contractAmount);
  const costVariance = variance(qboCost, operationalCost);
  const missingRateHours = quantity(Math.max(0, Number(input.labor.missingRateHours) || 0));
  const totalHours = quantity(Math.max(0, Number(input.labor.totalHours) || 0));
  const verifiedRateHours = quantity(Math.max(0, Number(input.labor.verifiedRateHours) || 0));
  const laborStatus = totalHours === 0 ? "no_labor" : missingRateHours > 0 ? "missing_rate" : "complete";
  const freshnessStatus: ReconciliationFreshness = !input.qbo?.syncedAt
    ? "never_synced"
    : input.qbo.asOfDate < input.asOfDate
      ? "stale"
      : "fresh";

  const reviewReasons: ReconciliationReason[] = [];
  if (freshnessStatus === "stale") {
    reviewReasons.push({ code: "stale_qbo_data", message: "QuickBooks actuals are older than the requested review date." });
  }
  if (!input.qbo || input.qbo.totalBilledToDate == null || input.qbo.totalCostToDate == null) {
    reviewReasons.push({ code: "missing_qbo_actuals", message: "QuickBooks has no saved actuals for this project." });
  }
  if (input.project.contractAmount == null) {
    reviewReasons.push({ code: "missing_tracker_contract", message: "Tracker does not have a contract amount for this project." });
  }
  if (missingRateHours > 0) {
    reviewReasons.push({ code: "missing_labor_rate", message: `${missingRateHours.toFixed(2)} labor hours do not have a verified QBO Time pay rate.` });
  }
  if (revenueVariance.material) {
    reviewReasons.push({ code: "revenue_variance", message: reasonForVariance("Revenue", revenueVariance) });
  }
  if (costVariance.material) {
    reviewReasons.push({ code: "cost_variance", message: reasonForVariance("Cost", costVariance) });
  }

  let category: ReconciliationCategory = "within_tolerance";
  let queueStatus: ReconciliationQueueStatus = "ready";
  let reason = "QBO and Tracker are within the review tolerance.";
  let nextAction = "No action needed.";

  if (freshnessStatus === "stale") {
    category = "stale_qbo_data";
    queueStatus = "waiting_for_fresh_qbo";
    reason = "QuickBooks actuals are older than the Tracker review date.";
    nextAction = "Refresh QBO before deciding whether this variance is real.";
  } else if (!input.qbo || input.qbo.totalBilledToDate == null || input.qbo.totalCostToDate == null) {
    category = "missing_qbo_actuals";
    queueStatus = "waiting_for_fresh_qbo";
    reason = "QuickBooks has no saved actuals for this project.";
    nextAction = "Refresh QBO before reviewing the project.";
  } else if (input.project.contractAmount == null) {
    category = "missing_tracker_contract";
    queueStatus = "needs_action";
    reason = "Tracker does not have a contract amount, so revenue and profit cannot be compared.";
    nextAction = "Add or confirm the Tracker contract amount.";
  } else if (missingRateHours > 0) {
    category = "missing_labor_rate";
    queueStatus = "needs_action";
    reason = `${missingRateHours.toFixed(2)} labor hours do not have a verified QBO Time pay rate.`;
    nextAction = "Resolve the verified QBO Time pay rate before relying on Tracker labor cost.";
  } else if (costVariance.material && (!revenueVariance.material || Math.abs(costVariance.amount ?? 0) >= Math.abs(revenueVariance.amount ?? 0))) {
    category = "cost_variance";
    queueStatus = "needs_action";
    reason = reasonForVariance("Cost", costVariance);
    nextAction = "Review project costs and confirm whether the difference is timing, payroll burden, classification, or a missing transaction.";
  } else if (revenueVariance.material) {
    category = "revenue_variance";
    queueStatus = "needs_action";
    reason = reasonForVariance("Revenue", revenueVariance);
    nextAction = "Review the contract, change orders, credits, and QBO billing total.";
  }

  return {
    contractVersion: FINANCIAL_RECONCILIATION_CONTRACT_VERSION,
    asOfDate: input.asOfDate,
    project: {
      id: input.project.projectId,
      name: input.project.projectName,
      jobNumber: input.project.jobNumber,
      client: input.project.client,
      owner: input.project.owner,
      status: input.project.projectStatus,
    },
    tracker: {
      contractAmount: input.project.contractAmount,
      expenses,
      verifiedDirectWages: directWages,
      operationalCost,
      operationalGrossProfit,
      evidenceUpdatedAt: input.project.trackerEvidenceUpdatedAt,
      sourceLabel: "Tracker operational evidence",
    },
    qbo: {
      totalBilledToDate: qboIncome,
      totalCostToDate: qboCost,
      netIncome: qboNetIncome,
      currentYearBillings: input.qbo?.currentYearBillings ?? null,
      currentYearCosts: input.qbo?.currentYearCosts ?? null,
      syncedAt: input.qbo?.syncedAt ?? null,
      sourceLabel: "QBO Project Profitability Summary",
      billingSource: input.qbo?.billingSource ?? null,
      costSource: input.qbo?.costSource ?? null,
    },
    laborCoverage: { totalHours, verifiedRateHours, missingRateHours, status: laborStatus },
    revenueVariance,
    costVariance,
    freshness: {
      status: freshnessStatus,
      qboAsOfDate: input.qbo?.asOfDate ?? null,
      qboSyncedAt: input.qbo?.syncedAt ?? null,
    },
    category,
    queueStatus,
    severity: buildSeverity({ category, revenueVariance, costVariance, missingRateHours }),
    reviewReasons,
    reason,
    nextAction,
  };
}

function canonicalFingerprintPayload(row: FinancialReconciliationRow) {
  return {
    contractVersion: row.contractVersion,
    asOfDate: row.asOfDate,
    projectId: row.project.id,
    category: row.category,
    queueStatus: row.queueStatus,
    severity: row.severity,
    tracker: {
      contractAmount: row.tracker.contractAmount,
      expenses: row.tracker.expenses,
      verifiedDirectWages: row.tracker.verifiedDirectWages,
      operationalCost: row.tracker.operationalCost,
    },
    qbo: {
      totalBilledToDate: row.qbo.totalBilledToDate,
      totalCostToDate: row.qbo.totalCostToDate,
      currentYearBillings: row.qbo.currentYearBillings,
      currentYearCosts: row.qbo.currentYearCosts,
      billingSource: row.qbo.billingSource,
      costSource: row.qbo.costSource,
    },
    laborCoverage: row.laborCoverage,
    revenueVariance: row.revenueVariance,
    costVariance: row.costVariance,
    reviewReasonCodes: row.reviewReasons.map((reason) => reason.code).sort(),
  };
}

export function buildReconciliationFingerprint(row: FinancialReconciliationRow): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalFingerprintPayload(row)))
    .digest("hex");
}
