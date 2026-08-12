import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const INTERNAL_LABOR_RATE = 41;

function sqft(description = "") {
  const match = description.match(/(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    ?? description.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isLegacyBeMatrix(description = "") {
  return /\bbe\s*matrix\b|\bbematrix\b/i.test(description);
}

function allocation(line) {
  const sell = Number(line.line_total ?? 0);
  const quantity = Number(line.quantity ?? 0);
  if (line.sku === "408004") {
    const hours = quantity / 2.4;
    return { kind: "bematrix", status: quantity > 0 ? "ready" : "needs_frames", hours, labor: hours * INTERNAL_LABOR_RATE, materials: 0 };
  }
  if (line.sku === "400800") {
    const area = sqft(line.description);
    if (!area) return { kind: "graphics", status: "needs_sqft", hours: 0, labor: 0, materials: 0 };
    const hours = Math.max(0, (sell - area * 25) / 105);
    return { kind: "graphics", status: "ready", hours, labor: hours * INTERNAL_LABOR_RATE, materials: area * 6.5 };
  }
  if (line.sku === "400100") {
    const hours = sell / 210;
    return { kind: "fabrication", status: sell > 0 ? "ready" : "needs_sell", hours, labor: hours * INTERNAL_LABOR_RATE, materials: sell / 4 };
  }
  if (isLegacyBeMatrix(line.description)) {
    return { kind: "legacy_bematrix", status: "review_required", hours: 0, labor: 0, materials: 0 };
  }
  return { kind: "other", status: "unchanged", hours: 0, labor: 0, materials: 0 };
}

const { data: projects, error: projectsError } = await supabase
  .from("projects")
  .select("id,name,status,budget_hrs,budget_materials")
  .eq("status", "Active")
  .order("id");
if (projectsError) throw projectsError;
const ids = projects.map((project) => project.id);
const { data: lines, error: linesError } = await supabase
  .from("quote_line_items")
  .select("project_id,sku,description,quantity,line_total")
  .in("project_id", ids);
if (linesError) throw linesError;

const linesByProject = new Map();
for (const line of lines ?? []) linesByProject.set(line.project_id, [...(linesByProject.get(line.project_id) ?? []), line]);
const preview = projects.map((project) => {
  const projectLines = linesByProject.get(project.id) ?? [];
  const calculated = projectLines.map((line) => ({ ...line, ...allocation(line) }));
  const blockers = calculated.filter((line) => line.status !== "ready" && line.status !== "unchanged");
  const readyLines = calculated.filter((line) => line.status === "ready");
  return {
    id: project.id,
    name: project.name,
    current: { labor_hours: Number(project.budget_hrs ?? 0), materials: Number(project.budget_materials ?? 0) },
    proposed: {
      labor_hours: Math.round(readyLines.reduce((sum, line) => sum + line.hours, 0)),
      labor_dollars: Math.round(readyLines.reduce((sum, line) => sum + line.labor, 0)),
      materials: Math.round(readyLines.reduce((sum, line) => sum + line.materials, 0)),
    },
    eligible: projectLines.length > 0 && readyLines.length > 0 && blockers.length === 0,
    blockers: blockers.map(({ kind, status, sku, description }) => ({ kind, status, sku, description })),
    formulas: calculated.filter((line) => line.kind !== "other").map(({ kind, status, sku, quantity, line_total, description, hours, labor, materials }) => ({ kind, status, sku, quantity, line_total, description, hours, labor, materials })),
  };
});
console.log(JSON.stringify({ generated_at: new Date().toISOString(), projects: preview, summary: { active: preview.length, eligible: preview.filter((row) => row.eligible).length, review_required: preview.filter((row) => row.blockers.length > 0).length } }, null, 2));
