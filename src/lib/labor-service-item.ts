export function normalizeLaborServiceItem(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "GRAPH LABOR" ? "GRAPHICS LABOR" : normalized;
}
