export const BONUS_RATE_UNDER_30 = 0;
export const BONUS_RATE_30_TO_39 = 0.005;
export const BONUS_RATE_40_TO_49 = 0.0075;
export const BONUS_RATE_50_PLUS = 0.01;

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
  profit_margin: number | null;
  bonus_rate: number;
  bonus: number;
  qbo_synced_at: string | null;
  bonus_source: "qbo" | "missing_qbo";
}

export function getPmBonusRateForMargin(profitMargin: number | null): number {
  if (profitMargin == null || profitMargin < 0.30) return BONUS_RATE_UNDER_30;
  if (profitMargin < 0.40) return BONUS_RATE_30_TO_39;
  if (profitMargin < 0.50) return BONUS_RATE_40_TO_49;
  return BONUS_RATE_50_PLUS;
}

export function buildPmBonusRows(
  projects: BonusProjectLike[],
  pnlByProjectId: Map<string, ProjectPnlLike>
): BonusRow[] {
  return projects.map((project) => {
    const pnl = pnlByProjectId.get(project.id) ?? null;
    const grossProfit = pnl?.qbo_net_income ?? null;
    const income = pnl?.qbo_income ?? null;
    const profitMargin = income && grossProfit != null ? grossProfit / income : null;
    const bonusRate = getPmBonusRateForMargin(profitMargin);
    const bonus = grossProfit == null ? 0 : Math.max(0, grossProfit) * bonusRate;

    return {
      id: project.id,
      name: project.name,
      client: project.client,
      close_date: project.close_date,
      contract_amount: project.contract_amount,
      qbo_income: income,
      qbo_expenses: pnl?.qbo_expenses ?? null,
      gross_profit: grossProfit,
      profit_margin: profitMargin,
      bonus_rate: bonusRate,
      bonus,
      qbo_synced_at: pnl?.synced_at ?? null,
      bonus_source: pnl ? "qbo" : "missing_qbo",
    };
  });
}
