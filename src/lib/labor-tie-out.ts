import { normalizeLaborWorkerName, type LaborWorkerClassification } from "./labor-worker-roster";

export type TieOutEntry = { id: string; projectId: string | null; serviceItem: string | null; employeeName: string; hours: number; hourlyRate: number };
type ExceptionReason = "missing_project" | "missing_service_item" | "unmapped_service_item" | "invalid_hours" | "invalid_rate" | "unclassified_worker";

export function buildLaborTieOut(entries: TieOutEntry[], classifications: Map<string, LaborWorkerClassification>, mappedServiceItems: Set<string>) {
  const included: TieOutEntry[] = [];
  const exceptions: Array<TieOutEntry & { reason: ExceptionReason }> = [];
  for (const entry of entries) {
    const reason = !entry.projectId ? "missing_project" : !entry.serviceItem ? "missing_service_item" : !mappedServiceItems.has(entry.serviceItem) ? "unmapped_service_item" : entry.hours <= 0 ? "invalid_hours" : entry.hourlyRate <= 0 ? "invalid_rate" : !classifications.has(normalizeLaborWorkerName(entry.employeeName)) ? "unclassified_worker" : null;
    if (reason) exceptions.push({ ...entry, reason }); else included.push(entry);
  }
  const totals = (rows: TieOutEntry[]) => ({ hours: round(rows.reduce((sum, row) => sum + Math.max(0, row.hours), 0)), wageCost: round(rows.reduce((sum, row) => sum + Math.max(0, row.hours) * Math.max(0, row.hourlyRate), 0)) });
  const source = totals(entries), ok = totals(included), excluded = totals(exceptions);
  return { included, exceptions, summary: { sourceRows: entries.length, includedRows: included.length, exceptionRows: exceptions.length, sourceHours: source.hours, includedHours: ok.hours, exceptionHours: excluded.hours, sourceWageCost: source.wageCost, includedWageCost: ok.wageCost, exceptionWageCost: excluded.wageCost, balancedPopulation: entries.length === included.length + exceptions.length, balancedWageCost: source.wageCost === round(ok.wageCost + excluded.wageCost) } };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
