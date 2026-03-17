export const LABOR_RATE = 30; // $/hr

export const BUDGET_FIELDS = [
  { key: "budget_hrs", label: "Labor Hours", isHours: true },
  { key: "budget_design", label: "Design", isHours: false },
  { key: "budget_pm", label: "Project Management", isHours: false },
  { key: "budget_shipping", label: "Shipping", isHours: false },
  { key: "budget_id_labor", label: "I&D Labor", isHours: false },
  { key: "budget_travel", label: "Travel", isHours: false },
  { key: "budget_props", label: "Props", isHours: false },
  { key: "budget_equipment", label: "Equipment", isHours: false },
  { key: "budget_flooring", label: "Flooring", isHours: false },
] as const;

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

export function getBudgetHealthColor(pct: number): string {
  if (pct >= 100) return "text-red-600 bg-red-50";
  if (pct >= 80) return "text-yellow-600 bg-yellow-50";
  return "text-green-600 bg-green-50";
}

export function getBudgetHealthBadge(pct: number): "destructive" | "secondary" | "default" {
  if (pct >= 100) return "destructive";
  if (pct >= 80) return "secondary";
  return "default";
}
