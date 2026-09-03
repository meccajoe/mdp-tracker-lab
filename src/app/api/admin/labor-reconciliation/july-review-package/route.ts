import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { getLaborGlAccountDisplay } from "@/lib/labor-gl-accounts";

const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const sheet = (rows: Record<string, unknown>[]) => XLSX.utils.json_to_sheet(rows);

export async function GET(request: NextRequest) {
  const actor = await requireProjectAdmin(request);
  if (!actor.ok) return actor.response;
  const { data: draft, error } = await actor.supabase.from("labor_allocation_je_reviews").select("*").eq("period_start", "2026-07-01").eq("period_end", "2026-07-31").order("created_at", { ascending: false }).limit(1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet(Object.entries(draft.source_snapshot.tie_out ?? {}).map(([metric, value]) => ({ Metric: metric, Value: value }))), "Tie-out summary");
  XLSX.utils.book_append_sheet(workbook, sheet(draft.journal_entry_lines.map((line: any) => ({ "Account ID": line.accountId, "GL Account": line.accountDisplay ?? getLaborGlAccountDisplay(line.accountId), "Project ID": line.projectId, Project: line.projectName, Memo: line.memo, Debit: line.debit, Credit: line.credit }))), "JE review");
  XLSX.utils.book_append_sheet(workbook, sheet(draft.allocation_rows.map((row: any) => ({ "Project ID": row.projectId, Project: row.projectName, "Service Item": row.serviceItem, "Target GL ID": row.targetGlAccountId, "Target GL Account": row.targetGlAccountDisplay ?? getLaborGlAccountDisplay(row.targetGlAccountId), Classification: row.workerClassification, Hours: row.hours, "Wage Cost": row.wageCost }))), "Allocation detail");
  XLSX.utils.book_append_sheet(workbook, sheet(draft.exception_rows.map((row: any) => ({ "Source Entry ID": row.id, Reason: row.reason }))), "Exceptions");
  XLSX.utils.book_append_sheet(workbook, sheet([{ "QBO Account ID": "427", "Source Account": "600100 Salaries & Wages", "Review Status": "Venturity review required" }, { "QBO Account ID": "392", "Source Account": "600150 Contract Labor", "Review Status": "Venturity review required" }]), "Source reconciliation");
  const body = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(body, { headers: { "Content-Type": contentType, "Content-Disposition": 'attachment; filename="july-2026-labor-review-package.xlsx"' } });
}
