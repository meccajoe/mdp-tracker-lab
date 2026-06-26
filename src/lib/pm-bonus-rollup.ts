import type { BonusRow } from "./pm-bonus";

export interface PmBonusMonthlyRollupRow {
  pmInitials: string;
  monthBonuses: Record<string, number>;
  ytdBonus: number;
}

export interface PmBonusMonthlyRollupResult {
  monthKeys: string[];
  pmRows: PmBonusMonthlyRollupRow[];
  monthTotals: Record<string, number>;
  ytdTotal: number;
}

export function buildPmBonusMonthlyRollup(
  projectsByPm: Map<string, readonly BonusRow[]>,
  year: number
): PmBonusMonthlyRollupResult {
  const monthSet = new Set<string>();
  const pmRows: PmBonusMonthlyRollupRow[] = [];
  const monthTotals: Record<string, number> = {};
  let ytdTotal = 0;

  for (const [pmInitials, rows] of projectsByPm.entries()) {
    const monthBonuses: Record<string, number> = {};
    let ytdBonus = 0;

    for (const row of rows) {
      if (!row.close_date) continue;
      const date = new Date(`${row.close_date}T00:00:00`);
      if (date.getFullYear() !== year) continue;
      const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthSet.add(monthKey);
      monthBonuses[monthKey] = (monthBonuses[monthKey] ?? 0) + row.bonus;
      monthTotals[monthKey] = (monthTotals[monthKey] ?? 0) + row.bonus;
      ytdBonus += row.bonus;
      ytdTotal += row.bonus;
    }

    pmRows.push({ pmInitials, monthBonuses, ytdBonus });
  }

  const monthKeys = [...monthSet].sort();
  pmRows.sort((a, b) => a.pmInitials.localeCompare(b.pmInitials));

  return { monthKeys, pmRows, monthTotals, ytdTotal };
}
