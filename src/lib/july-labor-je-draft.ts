import { getLaborGlAccountDisplay } from "./labor-gl-accounts";

type AllocationRow = { projectId: string; projectName: string; serviceItem: string; targetGlAccountId: string; workerClassification: "employee" | "contractor"; hours: number; wageCost: number };
type JeLine = { accountId: string; accountDisplay: string; projectId: string | null; projectName: string | null; memo: string; debit: number; credit: number };

export function buildJulyLaborJeDraft(rows: AllocationRow[]) {
  const debits = new Map<string, { accountId: string; projectId: string; projectName: string; wageCost: number }>();
  for (const row of rows) {
    const key = [row.projectId, row.targetGlAccountId].join("\u0000");
    const debit = debits.get(key) ?? { accountId: row.targetGlAccountId, projectId: row.projectId, projectName: row.projectName, wageCost: 0 };
    debit.wageCost += row.wageCost;
    debits.set(key, debit);
  }
  const lines: JeLine[] = [...debits.values()].map((debit) => ({ accountId: debit.accountId, accountDisplay: getLaborGlAccountDisplay(debit.accountId), projectId: debit.projectId, projectName: debit.projectName, memo: `July 2026 wage allocation — GL ${debit.accountId}`, debit: round(debit.wageCost), credit: 0 }));
  for (const workerClassification of ["employee", "contractor"] as const) {
    const amount = round(rows.filter((row) => row.workerClassification === workerClassification).reduce((sum, row) => sum + row.wageCost, 0));
    if (!amount) continue;
    const accountId = workerClassification === "employee" ? "427" : "392";
    lines.push({ accountId, accountDisplay: getLaborGlAccountDisplay(accountId), projectId: null, projectName: null, memo: `July 2026 ${workerClassification} wage allocation`, debit: 0, credit: amount });
  }
  const debitTotal = round(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = round(lines.reduce((sum, line) => sum + line.credit, 0));
  return { lines, debitTotal, creditTotal, balanced: debitTotal === creditTotal };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
