import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildJulyLaborAllocationGrid } from "@/lib/july-labor-allocation-grid";
import { buildJulyLaborJeDraft } from "@/lib/july-labor-je-draft";

export async function GET() {
  const actor = await requireProjectAdmin();
  if (!actor.ok) return actor.response;
  const entries: Array<{ project_id: string; employee_name: string; service_item: string | null; reg_hours: number; ot_hours: number; hourly_rate: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await actor.supabase.from("qbo_labor_entries").select("project_id,employee_name,service_item,reg_hours,ot_hours,hourly_rate").like("qbo_entry_id", "ts_%").gte("date", "2026-07-01").lte("date", "2026-07-31").range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    entries.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const [projects, classifications] = await Promise.all([
    actor.supabase.from("projects").select("id,name"),
    actor.supabase.from("labor_worker_classifications").select("normalized_name,classification").eq("roster_snapshot_date", "2026-08-14"),
  ]);
  const error = projects.error ?? classifications.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const projectNames = new Map<string, string>(((projects.data ?? []) as Array<{ id: string; name: string }>).map((project) => [project.id, project.name]));
  const workerClasses = new Map<string, "employee" | "contractor">(((classifications.data ?? []) as Array<{ normalized_name: string; classification: "employee" | "contractor" }>).map((row) => [row.normalized_name, row.classification]));
  const preview = buildJulyLaborAllocationGrid(entries.map((entry) => ({ projectId: entry.project_id, projectName: projectNames.get(entry.project_id) ?? entry.project_id, employeeName: entry.employee_name, serviceItem: entry.service_item, hours: Number(entry.reg_hours) + Number(entry.ot_hours), hourlyRate: Number(entry.hourly_rate) })), workerClasses);
  const totals = preview.rows.reduce((result, row) => ({ hours: result.hours + row.hours, wageCost: result.wageCost + row.wageCost, employeeWages: result.employeeWages + (row.workerClassification === "employee" ? row.wageCost : 0), contractorWages: result.contractorWages + (row.workerClassification === "contractor" ? row.wageCost : 0) }), { hours: 0, wageCost: 0, employeeWages: 0, contractorWages: 0 });
  const journalEntry = buildJulyLaborJeDraft(preview.rows);
  return NextResponse.json({ ...preview, totals, journalEntry });
}
