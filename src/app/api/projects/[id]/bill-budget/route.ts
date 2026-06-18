import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { canManageProjectActions } from "@/lib/admin-access";
import {
  buildBillBudgetName,
  calculateBillManagedBudgetTotal,
  seedBillBudgetForProject,
} from "@/lib/billcom-budget";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  if (!canManageProjectActions(roleRow?.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, job_number, pm, bill_budget_uuid, bill_job_name_snapshot, budget_travel, budget_props")
    .eq("id", id)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.bill_budget_uuid) {
    return NextResponse.json({ error: "BILL budget already exists for this project" }, { status: 409 });
  }

  const pmInitials = project.pm && project.pm !== "TBD" ? project.pm : null;
  let pmEmail: string | null = null;
  if (pmInitials) {
    const { data: pmRow } = await supabase
      .from("user_roles")
      .select("email")
      .eq("pm_initials", pmInitials)
      .maybeSingle();
    pmEmail = pmRow?.email?.toLowerCase() ?? null;
  }

  const jobNumber = project.job_number ?? project.id;
  const billJobNameSnapshot = buildBillBudgetName({
    billJobName: project.bill_job_name_snapshot,
    jobNumber,
    projectName: project.name,
  });
  const billBudgetTotal = calculateBillManagedBudgetTotal({
    budget_travel: project.budget_travel,
    budget_props: project.budget_props,
  });

  const seedResult = await seedBillBudgetForProject({
    projectId: project.id,
    projectName: project.name,
    jobNumber,
    billJobName: billJobNameSnapshot,
    budgetTravel: project.budget_travel ?? 0,
    budgetProps: project.budget_props ?? 0,
    pmEmail,
  });

  const updatePayload: Record<string, string | number | null> = {
    bill_job_name_snapshot: billJobNameSnapshot,
    bill_budget_total_snapshot: billBudgetTotal,
    bill_budget_last_sync_status: seedResult.status,
    bill_budget_last_sync_error: seedResult.error ?? null,
  };

  if (seedResult.status === "created" || seedResult.status === "created_with_member_warning") {
    updatePayload.bill_budget_uuid = seedResult.budgetUuid ?? null;
    updatePayload.bill_budget_name = seedResult.budgetName ?? billJobNameSnapshot;
    updatePayload.bill_budget_seeded_at = new Date().toISOString();
    updatePayload.bill_budget_seed_source = "manual_project_trigger";
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", project.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (seedResult.status === "skipped" && seedResult.error === "no_bill_managed_budget_default") {
    return NextResponse.json(
      {
        error: "No BILL-managed budget is available yet. Add travel and/or props budget, then retry.",
        details: seedResult,
      },
      { status: 400 }
    );
  }

  if (seedResult.status === "error") {
    return NextResponse.json(
      {
        error: seedResult.error ?? "BILL budget create failed",
        details: seedResult,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, result: seedResult });
}
