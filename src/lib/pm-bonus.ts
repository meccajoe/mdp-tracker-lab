export const BONUS_RATE = 0.01;

export interface BonusProjectLike {
  id: string;
  name: string;
  client: string;
  close_date: string | null;
  contract_amount: number | null;
  total_spent: number;
}

export interface ProjectPnlLike {
  project_id: string;
  qbo_income: number | null;
  qbo_expenses: number | null;
  qbo_net_income: number | null;
  synced_at: string | null;
}

export interface BonusRow {
  id: string;
  name: string;
  client: string;
  close_date: string | null;
  contract_amount: number | null;
  qbo_income: number | null;
  qbo_expenses: number | null;
  gross_profit: number | null;
  bonus: number;
  qbo_synced_at: string | null;
  bonus_source: "qbo" | "missing_qbo";
}

export function buildPmBonusRows(
  projects: BonusProjectLike[],
  pnlByProjectId: Map<string, ProjectPnlLike>
): BonusRow[] {
  return projects.map((project) => {
    const pnl = pnlByProjectId.get(project.id) ?? null;
    const grossProfit = pnl?.qbo_net_income ?? null;
    const bonus = grossProfit == null ? 0 : Math.max(0, grossProfit) * BONUS_RATE;

    return {
      id: project.id,
      name: project.name,
      client: project.client,
      close_date: project.close_date,
      contract_amount: project.contract_amount,
      qbo_income: pnl?.qbo_income ?? null,
      qbo_expenses: pnl?.qbo_expenses ?? null,
      gross_profit: grossProfit,
      bonus,
      qbo_synced_at: pnl?.synced_at ?? null,
      bonus_source: pnl ? "qbo" : "missing_qbo",
    };
  });
}
