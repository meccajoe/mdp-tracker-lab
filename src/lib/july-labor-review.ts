import { APPROVED_LABOR_SERVICE_ITEM_GL, buildJulyLaborAllocationGrid } from "./july-labor-allocation-grid";
import { buildLaborJeDraft } from "./july-labor-je-draft";
import { buildLaborTieOut } from "./labor-tie-out";
import { LaborReviewPeriod } from "./labor-review-period";

export async function buildLaborReview(supabase: any, period: LaborReviewPeriod, projectId: string | null) {
  const entries: Array<{ qbo_entry_id: string; project_id: string | null; employee_name: string; service_item: string | null; reg_hours: number; ot_hours: number; hourly_rate: number }> = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from("qbo_labor_entries").select("qbo_entry_id,project_id,employee_name,service_item,reg_hours,ot_hours,hourly_rate").like("qbo_entry_id", "ts_%").gte("date", period.startDate).lte("date", period.endDate).range(from, from + 999);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    entries.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const [projects, classifications] = await Promise.all([supabase.from("projects").select("id,name"), supabase.from("labor_worker_classifications").select("normalized_name,classification").eq("roster_snapshot_date", "2026-08-14")]);
  if (projects.error ?? classifications.error) throw new Error((projects.error ?? classifications.error).message);
  const projectNames = new Map<string, string>((projects.data ?? []).map((project: { id: string; name: string }) => [project.id, project.name]));
  const workerClasses = new Map<string, "employee" | "contractor">((classifications.data ?? []).map((row: { normalized_name: string; classification: "employee" | "contractor" }) => [row.normalized_name, row.classification]));
  const tieOut = buildLaborTieOut(entries.map((entry) => ({ id: entry.qbo_entry_id, projectId: entry.project_id, serviceItem: entry.service_item, employeeName: entry.employee_name, hours: Number(entry.reg_hours) + Number(entry.ot_hours), hourlyRate: Number(entry.hourly_rate) })), workerClasses, new Set(Object.keys(APPROVED_LABOR_SERVICE_ITEM_GL)));
  const preview = buildJulyLaborAllocationGrid(tieOut.included.map((entry) => ({ projectId: entry.projectId!, projectName: projectNames.get(entry.projectId!) ?? entry.projectId!, employeeName: entry.employeeName, serviceItem: entry.serviceItem, hours: entry.hours, hourlyRate: entry.hourlyRate })), workerClasses);
  const totals = preview.rows.reduce((result, row) => ({ hours: result.hours + row.hours, wageCost: result.wageCost + row.wageCost, employeeWages: result.employeeWages + (row.workerClassification === "employee" ? row.wageCost : 0), contractorWages: result.contractorWages + (row.workerClassification === "contractor" ? row.wageCost : 0) }), { hours: 0, wageCost: 0, employeeWages: 0, contractorWages: 0 });
  return { ...preview, period, totals, journalEntry: buildLaborJeDraft(preview.rows, period.label), tieOut, sourceEntryIds: tieOut.included.map((entry) => entry.id) };
}

export async function buildJulyLaborReview(supabase: any, projectId: string | null) {
  return buildLaborReview(supabase, { startDate: "2026-07-01", endDate: "2026-07-31", label: "July 2026", fileKey: "2026-07-01_to_2026-07-31" }, projectId);
}
