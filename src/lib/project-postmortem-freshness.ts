type SourceLike = {
  labor?: { rate_coverage?: { total_hours?: number; verified_hours?: number; missing_rate_hours?: number }; calculated_base_wage_cost?: number };
  expense_summary?: Array<{ category?: string; amount?: number }>;
  expenses?: Array<{ category?: string; amount?: number }>;
  issues?: Array<Record<string, unknown>>;
  quote_lines?: Array<Record<string, unknown>>;
};

const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const sortRecords = (rows: Array<Record<string, unknown>> = []) => [...rows].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));

function expenseSummary(source: SourceLike) {
  if (source.expense_summary) return [...source.expense_summary].map((row) => ({ category: row.category ?? "Uncategorized", amount: money(row.amount) })).sort((a, b) => a.category.localeCompare(b.category));
  const groups = new Map<string, number>();
  for (const row of source.expenses ?? []) groups.set(row.category ?? "Uncategorized", (groups.get(row.category ?? "Uncategorized") ?? 0) + Number(row.amount ?? 0));
  return [...groups].map(([category, amount]) => ({ category, amount: money(amount) })).sort((a, b) => a.category.localeCompare(b.category));
}

function fingerprint(source: SourceLike) {
  return {
    labor: JSON.stringify({
      total_hours: money(source.labor?.rate_coverage?.total_hours),
      verified_hours: money(source.labor?.rate_coverage?.verified_hours),
      missing_rate_hours: money(source.labor?.rate_coverage?.missing_rate_hours),
      calculated_base_wage_cost: money(source.labor?.calculated_base_wage_cost),
    }),
    expenses: JSON.stringify(expenseSummary(source)),
    issues: JSON.stringify(sortRecords(source.issues)),
    quote: JSON.stringify(sortRecords(source.quote_lines)),
  };
}

export function assessPostmortemFreshness(snapshot: SourceLike, current: SourceLike) {
  const before = fingerprint(snapshot);
  const after = fingerprint(current);
  const changes = (["labor", "expenses", "issues", "quote"] as const).filter((key) => before[key] !== after[key]);
  return { status: changes.length ? "stale" as const : "current" as const, changes };
}
