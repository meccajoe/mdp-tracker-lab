const BILLCOM_BASE_URL = process.env.BILLCOM_BASE_URL ?? "https://gateway.prod.bill.com/connect";
const BILLCOM_SPEND_URL = process.env.BILLCOM_SPEND_URL ?? "https://spend.bill.com";
const BILLCOM_SPEND_COMPANY_ID = process.env.BILLCOM_SPEND_COMPANY_ID ?? "Q29tcGFueTo1Njg3MzU=";
const BILLCOM_API_TOKEN = process.env.BILLCOM_API_TOKEN ?? "";
const BILLCOM_BUDGET_OWNER_UUID = process.env.BILLCOM_BUDGET_OWNER_UUID ?? "";
const BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL = (process.env.BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL ?? "paul@meccadesign.com").trim().toLowerCase();
const BILLCOM_ALWAYS_MEMBER_EMAILS = (
  process.env.BILLCOM_ALWAYS_MEMBER_EMAILS
  ?? "emily@meccadesign.com,production@meccadesign.com,rooster@meccadesign.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const BILL_SPEND_USERS_PAGE_LIMIT = 200;
const BILL_SPEND_USERS_MAX_PAGES = 10;

export const BILL_DEFAULT_INCLUDED_BUDGET_KEYS = ["budget_travel", "budget_props"] as const;

export type BillBudgetSeedStatus = "created" | "created_with_member_warning" | "skipped" | "error";
export type BillBudgetMemberStatus =
  | "assigned"
  | "owner_already_covers_pm"
  | "missing_pm_email"
  | "bill_user_not_found"
  | "assign_failed";

type BillBudgetProjectLike = {
  bill_budget_uuid?: string | null;
  budget_travel?: number | null;
  budget_props?: number | null;
};

type BillSpendUser = {
  id?: string;
  uuid?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  retired?: boolean;
  role?: string | null;
};

type BillSpendUsersResponse = {
  results?: BillSpendUser[];
  nextPage?: string | null;
};

export function calculateBillManagedBudgetTotal(project: BillBudgetProjectLike): number {
  return Math.round((project.budget_travel ?? 0) + (project.budget_props ?? 0));
}

export function shouldSeedBillBudget(project: BillBudgetProjectLike): boolean {
  if (project.bill_budget_uuid) return false;
  return calculateBillManagedBudgetTotal(project) > 0;
}

export function buildBillBudgetViewUrl({
  budgetId,
  companyId,
}: {
  budgetId?: string | null;
  companyId?: string | null;
}): string | null {
  if (!budgetId) return null;
  return `${BILLCOM_SPEND_URL}/companies/${companyId ?? BILLCOM_SPEND_COMPANY_ID}/budgets/${budgetId}`;
}

export interface BillBudgetLookupResult {
  exists: boolean;
  budgetUuid: string;
  budgetId?: string | null;
  budgetName?: string | null;
  retired?: boolean;
  error?: string;
}

export async function getBillBudgetByUuid(budgetUuid: string): Promise<BillBudgetLookupResult> {
  if (!BILLCOM_API_TOKEN) {
    return {
      exists: false,
      budgetUuid,
      error: "missing_billcom_budget_config",
    };
  }

  const response = await fetch(buildBillcomUrl(`/v3/spend/budgets/${budgetUuid}`), {
    headers: {
      apiToken: BILLCOM_API_TOKEN,
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return {
      exists: false,
      budgetUuid,
      error: "billcom_budget_missing:404",
    };
  }

  if (!response.ok) {
    return {
      exists: false,
      budgetUuid,
      error: `billcom_budget_lookup_failed:${response.status}:${await readBillcomError(response)}`,
    };
  }

  const data = (await response.json()) as { uuid?: string; id?: string; name?: string | null; retired?: boolean };

  if (data.retired) {
    return {
      exists: false,
      budgetUuid: data.uuid ?? data.id ?? budgetUuid,
      budgetId: data.id ?? null,
      budgetName: data.name ?? null,
      retired: true,
      error: "billcom_budget_missing:retired",
    };
  }

  return {
    exists: true,
    budgetUuid: data.uuid ?? data.id ?? budgetUuid,
    budgetId: data.id ?? null,
    budgetName: data.name ?? null,
    retired: Boolean(data.retired),
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized || null;
}

export function resolveBillSpendMemberEmail(user?: {
  bill_spend_email?: string | null;
  email?: string | null;
} | null): string | null {
  if (!user) return null;
  return normalizeEmail(user.bill_spend_email) ?? normalizeEmail(user.email);
}

export function buildBillBudgetMemberEmails(pmEmail?: string | null): string[] {
  const emails = [...BILLCOM_ALWAYS_MEMBER_EMAILS, normalizeEmail(pmEmail)]
    .filter((email): email is string => Boolean(email) && email !== BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL);
  return [...new Set(emails)];
}

function buildBillcomUrl(path: string): string {
  return `${BILLCOM_BASE_URL}${path}`;
}

async function readBillcomError(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 300);
}

async function listBillSpendUsers(): Promise<BillSpendUser[]> {
  if (!BILLCOM_API_TOKEN) return [];

  const users: BillSpendUser[] = [];
  let nextPage: string | null = null;

  for (let page = 0; page < BILL_SPEND_USERS_MAX_PAGES; page += 1) {
    const url = nextPage
      ? `${buildBillcomUrl("/v3/spend/users")}?nextPage=${encodeURIComponent(nextPage)}`
      : `${buildBillcomUrl("/v3/spend/users")}?limit=${BILL_SPEND_USERS_PAGE_LIMIT}`;

    const response = await fetch(url, {
      headers: {
        apiToken: BILLCOM_API_TOKEN,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`billcom_users_lookup_failed:${response.status}:${await readBillcomError(response)}`);
    }

    const data = (await response.json()) as BillSpendUsersResponse;
    users.push(...(data.results ?? []));
    nextPage = data.nextPage ?? null;

    if (!nextPage) break;
  }

  return users;
}

function findBillSpendUser(users: BillSpendUser[], email?: string | null): BillSpendUser | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return users.find((user) => normalizeEmail(user.email) === normalizedEmail) ?? null;
}

async function resolveBillBudgetOwner(users: BillSpendUser[]): Promise<{ uuid: string | null; email: string | null }> {
  const ownerUser = findBillSpendUser(users, BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL);
  if (ownerUser?.uuid) {
    return {
      uuid: ownerUser.uuid,
      email: normalizeEmail(ownerUser.email),
    };
  }

  if (BILLCOM_BUDGET_OWNER_UUID) {
    return {
      uuid: BILLCOM_BUDGET_OWNER_UUID,
      email: BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL,
    };
  }

  return {
    uuid: null,
    email: BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL,
  };
}

function buildMemberAssignmentWarning(status: BillBudgetMemberStatus, pmEmail?: string | null, detail?: string): string | null {
  switch (status) {
    case "assigned":
    case "owner_already_covers_pm":
    case "missing_pm_email":
      return null;
    case "bill_user_not_found":
      return `pm_budget_member_not_assigned:bill_user_not_found:${pmEmail ?? "unknown"}`;
    case "assign_failed":
      return `pm_budget_member_not_assigned:assign_failed:${detail ?? "unknown"}`;
    default:
      return `pm_budget_member_not_assigned:${status}`;
  }
}

type BillBudgetMemberReconciliation = {
  email: string;
  uuid: string | null;
  status: BillBudgetMemberStatus;
  detail?: string;
};

type BillBudgetMembersResponse = {
  results?: Array<{ userUuid?: string | null }>;
};

async function assignBillBudgetMember({
  budgetUuid,
  memberUuid,
}: {
  budgetUuid: string;
  memberUuid: string;
}): Promise<{ status: BillBudgetMemberStatus; detail?: string }> {
  const response = await fetch(buildBillcomUrl(`/v3/spend/budgets/${budgetUuid}/members/${memberUuid}`), {
    method: "PUT",
    headers: {
      apiToken: BILLCOM_API_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      limit: 0,
      recurringLimit: 0,
      shareBudgetFunds: false,
      role: "MEMBER",
    }),
  });

  if (!response.ok) {
    return {
      status: "assign_failed",
      detail: `billcom_budget_member_assign_failed:${response.status}:${await readBillcomError(response)}`,
    };
  }

  return { status: "assigned" };
}

async function listBillBudgetMemberUuids(budgetUuid: string): Promise<Set<string>> {
  const response = await fetch(
    buildBillcomUrl(`/v3/spend/budgets/${budgetUuid}/members?limit=${BILL_SPEND_USERS_PAGE_LIMIT}`),
    {
      headers: {
        apiToken: BILLCOM_API_TOKEN,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`billcom_budget_members_readback_failed:${response.status}:${await readBillcomError(response)}`);
  }

  const data = (await response.json()) as BillBudgetMembersResponse;
  return new Set(
    (data.results ?? [])
      .map((member) => member.userUuid)
      .filter((uuid): uuid is string => Boolean(uuid)),
  );
}

async function reconcileBillBudgetMembers({
  budgetUuid,
  users,
  pmEmail,
}: {
  budgetUuid: string;
  users: BillSpendUser[];
  pmEmail?: string | null;
}): Promise<BillBudgetMemberReconciliation[]> {
  const results: BillBudgetMemberReconciliation[] = [];

  for (const email of buildBillBudgetMemberEmails(pmEmail)) {
    const memberUser = findBillSpendUser(users, email);
    if (!memberUser?.uuid) {
      results.push({ email, uuid: null, status: "bill_user_not_found" });
      continue;
    }

    const assignment = await assignBillBudgetMember({
      budgetUuid,
      memberUuid: memberUser.uuid,
    });
    results.push({
      email,
      uuid: memberUser.uuid,
      status: assignment.status,
      detail: assignment.detail,
    });
  }

  let verifiedMemberUuids: Set<string>;
  try {
    verifiedMemberUuids = await listBillBudgetMemberUuids(budgetUuid);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "billcom_budget_members_readback_failed";
    return results.map((result) => result.status === "assigned"
      ? { ...result, status: "assign_failed", detail }
      : result);
  }

  return results.map((result) => (
    result.status === "assigned" && result.uuid && !verifiedMemberUuids.has(result.uuid)
      ? {
          ...result,
          status: "assign_failed" as const,
          detail: `billcom_budget_member_missing_after_assign:${result.email}`,
        }
      : result
  ));
}

function summarizeMemberReconciliation(
  results: BillBudgetMemberReconciliation[],
  pmEmail?: string | null,
): {
  memberStatus: BillBudgetMemberStatus;
  memberUuid: string | null;
  warning: string | null;
} {
  const normalizedPmEmail = normalizeEmail(pmEmail);
  const pmResult = normalizedPmEmail === BILLCOM_DEFAULT_BUDGET_OWNER_EMAIL
    ? { status: "owner_already_covers_pm" as const, uuid: null }
    : normalizedPmEmail
      ? results.find((result) => result.email === normalizedPmEmail)
      : null;
  const warning = results
    .map((result) => buildMemberAssignmentWarning(result.status, result.email, result.detail))
    .filter((value): value is string => Boolean(value))
    .join(";") || null;

  return {
    memberStatus: pmResult?.status ?? (normalizedPmEmail ? "bill_user_not_found" : "missing_pm_email"),
    memberUuid: pmResult?.uuid ?? null,
    warning,
  };
}

export function buildBillBudgetDescription({
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
  return `Travel ${formatCurrency(travel)} | Props ${formatCurrency(props)} | Total ${formatCurrency(total)} | MDP seed ${seededAt}`;
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
  pmEmail?: string | null;
}

export interface BillBudgetSeedResult {
  status: BillBudgetSeedStatus;
  budgetUuid?: string;
  budgetName?: string;
  budgetTotal?: number;
  error?: string;
  description?: string;
  ownerUuid?: string | null;
  memberStatus?: BillBudgetMemberStatus;
  memberEmail?: string | null;
  memberUuid?: string | null;
}

export async function updateBillBudgetForProject(input: BillBudgetSeedInput & { budgetUuid: string }): Promise<BillBudgetSeedResult> {
  const total = calculateBillManagedBudgetTotal({
    budget_travel: input.budgetTravel,
    budget_props: input.budgetProps,
  });

  if (!BILLCOM_API_TOKEN) {
    return { status: "error", error: "missing_billcom_budget_config", budgetTotal: total };
  }

  let users: BillSpendUser[] = [];
  try {
    users = await listBillSpendUsers();
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "billcom_users_lookup_failed",
      budgetTotal: total,
    };
  }

  const owner = await resolveBillBudgetOwner(users);
  if (!owner.uuid) {
    return {
      status: "error",
      error: "missing_billcom_budget_owner",
      budgetTotal: total,
    };
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

  const response = await fetch(buildBillcomUrl(`/v3/spend/budgets/${input.budgetUuid}`), {
    method: "PATCH",
    headers: {
      apiToken: BILLCOM_API_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: budgetName,
      description,
      recurringInterval: "NONE",
      limit: total,
    }),
  });

  if (!response.ok) {
    return {
      status: "error",
      error: `billcom_budget_update_failed:${response.status}:${await readBillcomError(response)}`,
      budgetUuid: input.budgetUuid,
      budgetName,
      budgetTotal: total,
      description,
      ownerUuid: owner.uuid,
    };
  }

  const data = (await response.json()) as { uuid?: string; id?: string; name?: string };
  const budgetUuid = data.uuid ?? data.id ?? input.budgetUuid;
  const pmEmail = normalizeEmail(input.pmEmail);
  const memberResults = await reconcileBillBudgetMembers({ budgetUuid, users, pmEmail });
  const { memberStatus, memberUuid, warning } = summarizeMemberReconciliation(memberResults, pmEmail);

  return {
    status: warning ? "created_with_member_warning" : "created",
    budgetUuid,
    budgetName: data.name ?? budgetName,
    budgetTotal: total,
    description,
    ownerUuid: owner.uuid,
    memberStatus,
    memberEmail: pmEmail,
    memberUuid,
    error: warning ?? undefined,
  };
}

export async function seedBillBudgetForProject(input: BillBudgetSeedInput): Promise<BillBudgetSeedResult> {
  const total = calculateBillManagedBudgetTotal({
    budget_travel: input.budgetTravel,
    budget_props: input.budgetProps,
  });

  if (total <= 0) {
    return { status: "skipped", error: "no_bill_managed_budget_default", budgetTotal: total };
  }

  if (!BILLCOM_API_TOKEN) {
    return { status: "error", error: "missing_billcom_budget_config", budgetTotal: total };
  }

  let users: BillSpendUser[] = [];
  try {
    users = await listBillSpendUsers();
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "billcom_users_lookup_failed",
      budgetTotal: total,
    };
  }

  const owner = await resolveBillBudgetOwner(users);
  if (!owner.uuid) {
    return {
      status: "error",
      error: "missing_billcom_budget_owner",
      budgetTotal: total,
    };
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

  const response = await fetch(buildBillcomUrl("/v3/spend/budgets"), {
    method: "POST",
    headers: {
      apiToken: BILLCOM_API_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: budgetName,
      description,
      owners: [owner.uuid],
      recurringInterval: "NONE",
      limit: total,
    }),
  });

  if (!response.ok) {
    return {
      status: "error",
      error: `billcom_budget_create_failed:${response.status}:${await readBillcomError(response)}`,
      budgetName,
      budgetTotal: total,
      description,
      ownerUuid: owner.uuid,
    };
  }

  const data = (await response.json()) as { uuid?: string; id?: string; name?: string };
  const budgetUuid = data.uuid ?? data.id;
  const pmEmail = normalizeEmail(input.pmEmail);
  const memberResults = budgetUuid
    ? await reconcileBillBudgetMembers({ budgetUuid, users, pmEmail })
    : buildBillBudgetMemberEmails(pmEmail).map((email) => ({
        email,
        uuid: null,
        status: "assign_failed" as const,
        detail: "billcom_budget_member_assign_failed:missing_budget_uuid",
      }));
  const { memberStatus, memberUuid, warning } = summarizeMemberReconciliation(memberResults, pmEmail);

  return {
    status: warning ? "created_with_member_warning" : "created",
    budgetUuid,
    budgetName: data.name ?? budgetName,
    budgetTotal: total,
    description,
    ownerUuid: owner.uuid,
    memberStatus,
    memberEmail: pmEmail,
    memberUuid,
    error: warning ?? undefined,
  };
}
