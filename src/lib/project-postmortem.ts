export type PostMortemLaborEntry = { service_item: string | null; reg_hours: number; ot_hours: number; hourly_rate: number | null; qbo_entry_id: string };

export function buildPostMortemLaborSummary(entries: PostMortemLaborEntry[]) {
  const byServiceItem = new Map<string, { hours: number; calculated_cost: number; entry_ids: string[] }>();
  for (const entry of entries) {
    const label = entry.service_item?.trim() || "Unassigned";
    const current = byServiceItem.get(label) ?? { hours: 0, calculated_cost: 0, entry_ids: [] };
    const hours = Number(entry.reg_hours ?? 0) + Number(entry.ot_hours ?? 0);
    current.hours += hours;
    current.calculated_cost += hours * Number(entry.hourly_rate ?? 0);
    current.entry_ids.push(entry.qbo_entry_id);
    byServiceItem.set(label, current);
  }
  return [...byServiceItem.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([service_item, value]) => ({ service_item, hours: Math.round(value.hours * 10) / 10, calculated_labor_cost: Math.round(value.calculated_cost * 100) / 100, entry_ids: value.entry_ids }));
}

export function buildPostMortemDataGaps(labor: ReturnType<typeof buildPostMortemLaborSummary>) {
  const gaps: string[] = [];
  if (labor.some((row) => row.service_item === "Unassigned")) gaps.push("Some labor entries have no service-item/trade coding.");
  if (labor.some((row) => row.calculated_labor_cost === 0 && row.hours > 0)) gaps.push("Some labor hours lack a verified rate; calculated labor cost may be incomplete.");
  return gaps;
}
