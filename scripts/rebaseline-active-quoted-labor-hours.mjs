import { createClient } from "@supabase/supabase-js";

const RATE = 105;
const apply = process.argv.includes("--apply");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: projects, error } = await supabase.from("projects").select("id,status,quote_materials,pct_labor,budget_hrs").eq("status", "Active");
if (error) throw error;
const rows = (projects ?? []).filter((p) => Number(p.quote_materials) > 0).map((p) => ({ ...p, next_budget_hrs: Math.round((Number(p.quote_materials) * Number(p.pct_labor ?? 25) / 100) / RATE) }));
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", rate: RATE, affected: rows.length, rows }, null, 2));
if (apply) {
  for (const row of rows) {
    const { error: updateError } = await supabase.from("projects").update({ budget_hrs: row.next_budget_hrs }).eq("id", row.id);
    if (updateError) throw updateError;
  }
}
