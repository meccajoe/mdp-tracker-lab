import { createClient } from "@supabase/supabase-js";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function ExpensesPage() {
  const supabase = getSupabaseAdmin();

  const [{ data: expenses }, { data: projects }, { data: pmRows }] = await Promise.all([
    supabase.from("expenses").select("*").order("date", { ascending: false }),
    supabase.from("projects").select("id, name, pm, job_number"),
    supabase.from("user_roles").select("pm_initials").eq("show_in_filters", true).not("pm_initials", "is", null),
  ]);

  const activePMs = (pmRows ?? []).map((r) => r.pm_initials as string);

  return <ExpensesClient expenses={expenses ?? []} projects={projects ?? []} activePMs={activePMs} />;
}
