type AllocationRow = { projectId: string; projectName: string; serviceItem: string; targetGlAccountId: string; workerClassification: "employee" | "contractor"; hours: number; wageCost: number };
type JeLine = { accountId: string; projectId: string | null; projectName: string | null; memo: string; debit: number; credit: number };

export function buildJulyLaborJeDraft(rows: AllocationRow[]) {
  const lines: JeLine[] = rows.map((row) => ({ accountId: row.targetGlAccountId, projectId: row.projectId, projectName: row.projectName, memo: `July 2026 wage allocation — ${row.serviceItem}`, debit: round(row.wageCost), credit: 0 }));
  for (const workerClassification of ["employee", "contractor"] as const) {
    const amount = round(rows.filter((row) => row.workerClassification === workerClassification).reduce((sum, row) => sum + row.wageCost, 0));
    if (!amount) continue;
    lines.push({ accountId: workerClassification === "employee" ? "427" : "392", projectId: null, projectName: null, memo: `July 2026 ${workerClassification} wage allocation`, debit: 0, credit: amount });
  }
  const debitTotal = round(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = round(lines.reduce((sum, line) => sum + line.credit, 0));
  return { lines, debitTotal, creditTotal, balanced: debitTotal === creditTotal };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
