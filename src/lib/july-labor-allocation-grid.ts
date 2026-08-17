import { normalizeLaborWorkerName, type LaborWorkerClassification } from "./labor-worker-roster";

export const APPROVED_LABOR_SERVICE_ITEM_GL: Record<string, string> = {
  "CNC LABOR": "231", "ELEC LABOR": "231", "FAB LABOR": "231", "GRAPHICS LABOR": "105", "INSTALL LABOR": "110", "LAM LABOR": "231", "METAL LABOR": "231", "PACK LABOR": "231", "PAINT LABOR": "231", "SCUPT LABOR": "231", "SHOP LABOR": "231", "WOOD LABOR": "231",
};

export function buildJulyLaborAllocationGrid(entries: Array<{ projectId: string; projectName: string; employeeName: string; serviceItem: string | null; hours: number; hourlyRate: number }>, classifications: Map<string, LaborWorkerClassification>) {
  const rows = new Map<string, { projectId: string; projectName: string; serviceItem: string; targetGlAccountId: string; workerClassification: LaborWorkerClassification; hours: number; wageCost: number }>();
  const unclassifiedWorkers = new Set<string>();
  for (const entry of entries) {
    if (entry.hours <= 0 || entry.hourlyRate <= 0) continue;
    const workerClassification = classifications.get(normalizeLaborWorkerName(entry.employeeName));
    if (!workerClassification) { unclassifiedWorkers.add(entry.employeeName); continue; }
    const serviceItem = entry.serviceItem ?? "Unclassified";
    const targetGlAccountId = APPROVED_LABOR_SERVICE_ITEM_GL[serviceItem];
    if (!targetGlAccountId) continue;
    const key = [entry.projectId, serviceItem, workerClassification].join("\u0000");
    const row = rows.get(key) ?? { projectId: entry.projectId, projectName: entry.projectName, serviceItem, targetGlAccountId, workerClassification, hours: 0, wageCost: 0 };
    row.hours += entry.hours; row.wageCost += entry.hours * entry.hourlyRate; rows.set(key, row);
  }
  return { rows: [...rows.values()].map((row) => ({ ...row, hours: round(row.hours), wageCost: round(row.wageCost) })).sort((a,b) => a.projectId.localeCompare(b.projectId) || a.serviceItem.localeCompare(b.serviceItem)), unclassifiedWorkers: [...unclassifiedWorkers].sort() };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
