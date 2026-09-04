import { getLaborGlAccountDisplay } from "./labor-gl-accounts";

type AllocationRow = { projectId: string; projectName: string; serviceItem: string; targetGlAccountId: string; workerClassification: "employee" | "contractor"; hours: number; wageCost: number };
type JeLine = { accountId: string; accountDisplay: string; projectId: string | null; projectName: string | null; memo: string; debit: number; credit: number };
const APPROVED_COGS_RECLASS_ACCOUNT_IDS = new Set(["231", "110", "105"]);

export function buildLaborJeDraft(rows: AllocationRow[], periodLabel: string) {
  const debits = new Map<string, { accountId: string; projectId: string; projectName: string; wageCost: number }>();
  const credits = new Map<string, number>();
  for (const row of rows) {
    if (!APPROVED_COGS_RECLASS_ACCOUNT_IDS.has(row.targetGlAccountId)) throw new Error(`Unsupported labor COGS reclass account: ${row.targetGlAccountId}`);
    const key = [row.projectId, row.targetGlAccountId].join("\u0000");
    const debit = debits.get(key) ?? { accountId: row.targetGlAccountId, projectId: row.projectId, projectName: row.projectName, wageCost: 0 };
    debit.wageCost += row.wageCost;
    debits.set(key, debit);
    credits.set(row.targetGlAccountId, (credits.get(row.targetGlAccountId) ?? 0) + row.wageCost);
  }
  const lines: JeLine[] = [...debits.values()].map((debit) => ({ accountId: debit.accountId, accountDisplay: getLaborGlAccountDisplay(debit.accountId), projectId: debit.projectId, projectName: debit.projectName, memo: `${periodLabel} wage allocation - GL ${debit.accountId}`, debit: round(debit.wageCost), credit: 0 }));
  for (const [accountId, amount] of credits) lines.push({ accountId, accountDisplay: getLaborGlAccountDisplay(accountId), projectId: null, projectName: null, memo: `${periodLabel} wage reclass - unprojected COGS`, debit: 0, credit: round(amount) });
  const debitTotal = round(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = round(lines.reduce((sum, line) => sum + line.credit, 0));
  return { lines, debitTotal, creditTotal, balanced: debitTotal === creditTotal };
}
export function buildJulyLaborJeDraft(rows: AllocationRow[]) { return buildLaborJeDraft(rows, "July 2026"); }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
