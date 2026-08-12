import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

const RATE = 41;
function sqft(text = "") { const m = text.match(/(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ?? text.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i); const n = m ? Number(m[1]) : NaN; return Number.isFinite(n) && n > 0 ? n : null; }
function formula(line: any) {
  const sell = Number(line.line_total ?? 0), qty = Number(line.quantity ?? 0), description = line.description ?? "";
  if (line.sku === "408004") { const frames = Number(line.override?.frame_count ?? qty); const hours = frames / 2.4; return { type: "BeMatrix", status: frames > 0 ? "Ready" : "Needs frame quantity", hours, labor: hours * RATE, materials: 0 }; }
  if (line.sku === "400800" || line.sku === "400801") { const isMarley = line.sku === "400801"; const area = Number(line.override?.square_feet ?? sqft(description)); const label = isMarley ? "Marley flooring" : "Graphics"; if (!area) return { type: label, status: "Needs SQFT", hours: 0, labor: 0, materials: 0 }; const hours = Math.max(0, (sell - area * 25) / 105); return { type: `${label} · ${area} SQFT`, status: "Ready", hours, labor: hours * RATE, materials: area * (isMarley ? 22 : 6.5) }; }
  if (line.sku === "400100") { const hours = sell / 210; return { type: "Fabrication", status: sell > 0 ? "Ready" : "Needs sell amount", hours, labor: hours * RATE, materials: sell / 4 }; }
  if (/\bbe\s*matrix\b|\bbematrix\b/i.test(description)) return { type: "Legacy BeMatrix", status: "Review required", hours: 0, labor: 0, materials: 0 };
  return { type: "Other", status: "Unchanged", hours: 0, labor: 0, materials: 0 };
}
export async function GET() {
  const actor = await requireProjectAdmin(); if (!actor.ok) return actor.response;
  const { data: projects, error: projectError } = await actor.supabase.from("projects").select("id,name,status,budget_hrs,budget_materials").eq("status", "Active").order("id");
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  const ids = (projects ?? []).map((p: any) => p.id);
  const { data: lines, error: lineError } = await actor.supabase.from("quote_line_items").select("id,project_id,sku,description,quantity,line_total").in("project_id", ids);
  const lineIds = (lines ?? []).map((line: any) => line.id);
  const { data: overrides, error: overrideError } = lineIds.length ? await actor.supabase.from("quote_line_formula_overrides").select("quote_line_item_id,formula_type,square_feet,frame_count,notes").in("quote_line_item_id", lineIds) : { data: [], error: null };
  if (lineError ?? overrideError) return NextResponse.json({ error: (lineError ?? overrideError)?.message }, { status: 500 });
  const overrideByLine = new Map((overrides ?? []).map((override: any) => [override.quote_line_item_id, override]));
  const byProject = new Map<string, any[]>(); for (const line of lines ?? []) byProject.set(line.project_id, [...(byProject.get(line.project_id) ?? []), { ...line, override: overrideByLine.get(line.id) }]);
  const rows: any[] = (projects ?? []).map((project: any) => { const entries = (byProject.get(project.id) ?? []).map((line) => ({ ...line, ...formula(line) })); const review = entries.filter((line) => !["Ready", "Unchanged"].includes(line.status)); const ready = entries.filter((line) => line.status === "Ready"); return { id: project.id, name: project.name, current_hours: Number(project.budget_hrs ?? 0), current_materials: Number(project.budget_materials ?? 0), proposed_hours: Math.round(ready.reduce((s, line) => s + line.hours, 0)), proposed_labor: Math.round(ready.reduce((s, line) => s + line.labor, 0)), proposed_materials: Math.round(ready.reduce((s, line) => s + line.materials, 0)), eligible: entries.length > 0 && ready.length > 0 && review.length === 0, entries: entries.filter((line) => line.type !== "Other") }; });
  return NextResponse.json({ rows, summary: { active: rows.length, eligible: rows.filter((row) => row.eligible).length, review: rows.filter((row) => row.entries.some((entry: any) => entry.status !== "Ready")).length } });
}

export async function PUT(request: Request) {
  const actor = await requireProjectAdmin(); if (!actor.ok) return actor.response;
  const body = await request.json().catch(() => ({})) as { quoteLineItemId?: string; squareFeet?: number; notes?: string };
  const squareFeet = Number(body.squareFeet);
  if (!body.quoteLineItemId || !Number.isFinite(squareFeet) || squareFeet <= 0) return NextResponse.json({ error: "A valid SQFT value is required." }, { status: 400 });
  const { error } = await actor.supabase.from("quote_line_formula_overrides").upsert({ quote_line_item_id: body.quoteLineItemId, formula_type: "graphics", square_feet: squareFeet, frame_count: null, notes: body.notes ?? "", reviewed_by: actor.actorEmail, reviewed_at: new Date().toISOString() }, { onConflict: "quote_line_item_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}