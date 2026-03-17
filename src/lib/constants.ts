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

// Round to nearest dollar
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

// Returns Tailwind color classes for budget health
export function getBudgetHealthColor(pct: number): string {
  if (pct >= 100) return "text-red-600";
  if (pct >= 80) return "text-yellow-600";
  return "text-green-600";
}

// Returns Tailwind bg + text classes for progress fill and pill
export function getBudgetHealthClasses(pct: number): {
  pill: string;
  bar: string;
} {
  if (pct >= 100) return { pill: "bg-red-100 text-red-700 border-red-200", bar: "bg-red-500" };
  if (pct >= 80) return { pill: "bg-yellow-100 text-yellow-700 border-yellow-200", bar: "bg-yellow-500" };
  return { pill: "bg-green-100 text-green-700 border-green-200", bar: "bg-green-500" };
}

export function getBudgetHealthBadge(pct: number): "destructive" | "secondary" | "default" {
  if (pct >= 100) return "destructive";
  if (pct >= 80) return "secondary";
  return "default";
}
