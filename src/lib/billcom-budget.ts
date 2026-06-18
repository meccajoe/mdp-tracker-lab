const BILLCOM_BASE_URL = process.env.BILLCOM_BASE_URL ?? "https://gateway.prod.bill.com/connect";
const BILLCOM_API_TOKEN = process.env.BILLCOM_API_TOKEN ?? "";
const BILLCOM_BUDGET_OWNER_UUID = process.env.BILLCOM_BUDGET_OWNER_UUID ?? "";

export const BILL_DEFAULT_INCLUDED_BUDGET_KEYS = ["budget_travel", "budget_props"] as const;

type BillBudgetProjectLike = {
  bill_budget_uuid?: string | null;
  budget_travel?: number | null;
  budget_props?: number | null;
};

export function calculateBillManagedBudgetTotal(project: BillBudgetProjectLike): number {
  return Math.round((project.budget_travel ?? 0) + (project.budget_props ?? 0));
}

export function shouldSeedBillBudget(project: BillBudgetProjectLike): boolean {
  if (project.bill_budget_uuid) return false;
  return calculateBillManagedBudgetTotal(project) > 0;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function buildBillBudgetDescription({
  projectId,
  jobName,
  travel,
  props,
  total,
  seededAt,
}: {
  projectId: string;
  jobName: string;
  travel: number;
  props: number;
  total: number;
  seededAt: string;
}): string {
  return [
    "BILL-managed budget snapshot",
    `Job: ${jobName}`,
    `MDP Project: ${projectId}`,
    "",
    "Included by default:",
    `Travel: ${formatCurrency(travel)}`,
    `Props: ${formatCurrency(props)}`,
    "",
    `BILL-managed total: ${formatCurrency(total)}`,
    "",
    "Excluded from BILL default budget:",
    "Labor Hours, Materials, Design, PM, Shipping, Crating, I&D Labor, Equipment, Rental, Flooring/Graphics",
    "",
    "Source: MDP Tracker",
    `Seeded: ${seededAt}`,
  ].join("\n");
}

export function buildBillBudgetName({
  billJobName,
  jobNumber,
  projectName,
}: {
  billJobName?: string | null;
  jobNumber: string;
  projectName: string;
}): string {
  return (billJobName?.trim() || `${jobNumber} - ${projectName}`).trim();
}

export interface BillBudgetSeedInput {
  projectId: string;
  projectName: string;
  jobNumber: string;
  billJobName?: string | null;
  budgetTravel: number;
  budgetProps: number;
}

export interface BillBudgetSeedResult {
  status: "created" | "skipped" | "error";
  budgetUuid?: string;
  budgetName?: string;
  budgetTotal?: number;
  error?: string;
  description?: string;
}

export async function seedBillBudgetForProject(input: BillBudgetSeedInput): Promise<BillBudgetSeedResult> {
  const total = calculateBillManagedBudgetTotal({
    budget_travel: input.budgetTravel,
    budget_props: input.budgetProps,
  });

  if (total <= 0) {
    return { status: "skipped", error: "no_bill_managed_budget_default", budgetTotal: total };
  }

  if (!BILLCOM_API_TOKEN || !BILLCOM_BUDGET_OWNER_UUID) {
    return { status: "error", error: "missing_billcom_budget_config", budgetTotal: total };
  }

  const budgetName = buildBillBudgetName({
    billJobName: input.billJobName,
    jobNumber: input.jobNumber,
    projectName: input.projectName,
  });

  const description = buildBillBudgetDescription({
    projectId: input.projectId,
    jobName: budgetName,
    travel: input.budgetTravel,
    props: input.budgetProps,
    total,
    seededAt: new Date().toISOString().slice(0, 10),
  });

  const response = await fetch(`${BILLCOM_BASE_URL}/v3/spend/budgets`, {
    method: "POST",
    headers: {
      apiToken: BILLCOM_API_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: budgetName,
      description,
      owners: [BILLCOM_BUDGET_OWNER_UUID],
      recurringInterval: "NONE",
      limit: total,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      status: "error",
      error: `billcom_budget_create_failed:${response.status}:${text.slice(0, 200)}`,
      budgetName,
      budgetTotal: total,
      description,
    };
  }

  const data = await response.json() as { uuid?: string; id?: string; name?: string };
  return {
    status: "created",
    budgetUuid: data.uuid ?? data.id,
    budgetName: data.name ?? budgetName,
    budgetTotal: total,
    description,
  };
}
