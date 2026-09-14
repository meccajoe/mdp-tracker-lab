import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { canManageProjectActions } from "@/lib/admin-access";
import {
  buildBillBudgetName,
  buildBillBudgetViewUrl,
  calculateBillManagedBudgetTotal,
  getBillBudgetByUuid,
  isBillBudgetLinkSuccess,
  resolveBillSpendMemberEmail,
  seedBillBudgetForProject,
  updateBillBudgetForProject,
} from "@/lib/billcom-budget";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function getAuthedContext(requireAdmin = false) {
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
    return {
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      supabase: null,
      user: null,
    };
  }

  const supabase = getSupabaseAdmin();

  if (!requireAdmin) {
    return { error: null, supabase, user };
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (roleError) {
    return {
      error: NextResponse.json({ error: roleError.message }, { status: 500 }),
      supabase: null,
      user: null,
    };
  }

  if (!canManageProjectActions(roleRow?.role)) {
    return {
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
      supabase: null,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

type BillBudgetProjectRow = {
  id: string;
  name: string;
  job_number: string | null;
  pm: string | null;
  bill_budget_uuid: string | null;
  bill_budget_name: string | null;
  bill_job_name_snapshot: string | null;
  bill_budget_seeded_at?: string | null;
  bill_budget_seed_source?: string | null;
  bill_budget_last_sync_status?: string | null;
  bill_budget_last_sync_error?: string | null;
  bill_budget_total_snapshot?: number | null;
  budget_travel: number | null;
  budget_props: number | null;
};

async function getProjectForBillBudget(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string,
): Promise<{ project: BillBudgetProjectRow | null; error: string | null }> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, job_number, pm, bill_budget_uuid, bill_budget_name, bill_job_name_snapshot, bill_budget_seeded_at, bill_budget_seed_source, bill_budget_last_sync_status, bill_budget_last_sync_error, bill_budget_total_snapshot, budget_travel, budget_props")
    .eq("id", id)
    .maybeSingle();

  if (projectError) {
    return { project: null, error: projectError.message };
  }

  return { project: (project as BillBudgetProjectRow | null) ?? null, error: null };
}

async function clearMissingBillBudgetLink(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  project: BillBudgetProjectRow,
  missingError: string,
) {
  const updatePayload = {
    bill_budget_uuid: null,
    bill_budget_name: null,
    bill_budget_last_sync_status: "missing_in_bill",
    bill_budget_last_sync_error: missingError,
  };

  const { error } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", project.id);

  return { error, updatePayload };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { error, supabase } = await getAuthedContext(false);
  if (error || !supabase) return error;

  const { project, error: projectError } = await getProjectForBillBudget(supabase, id);
  if (projectError) {
    return NextResponse.json({ error: projectError }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.bill_budget_uuid) {
    return NextResponse.json({ ok: true, exists: false, staleCleared: false });
  }

  const lookup = await getBillBudgetByUuid(project.bill_budget_uuid);

  if (lookup.exists) {
    if (lookup.budgetName && lookup.budgetName !== project.bill_budget_name) {
      await supabase
        .from("projects")
        .update({
          bill_budget_name: lookup.budgetName,
          bill_budget_last_sync_error: null,
        })
        .eq("id", project.id);
    }

    return NextResponse.json({
      ok: true,
      exists: true,
      staleCleared: false,
      budgetUuid: lookup.budgetUuid,
      budgetId: lookup.budgetId ?? null,
      budgetName: lookup.budgetName ?? project.bill_budget_name ?? null,
      viewUrl: buildBillBudgetViewUrl({ budgetId: lookup.budgetId ?? null }),
    });
  }

  if (lookup.error?.startsWith("billcom_budget_missing:")) {
    const { error: clearError } = await clearMissingBillBudgetLink(supabase, project, lookup.error);
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      exists: false,
      staleCleared: true,
      missingStatus: "missing_in_bill",
      error: lookup.error,
    });
  }

  return NextResponse.json(
    {
      error: lookup.error ?? "Failed to validate BILL budget",
      exists: false,
      staleCleared: false,
    },
    { status: 502 }
  );
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { error, supabase } = await getAuthedContext(true);
  if (error || !supabase) return error;

  const { project, error: projectError } = await getProjectForBillBudget(supabase, id);
  if (projectError) {
    return NextResponse.json({ error: projectError }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let syncingExistingBudget = false;

  if (project.bill_budget_uuid) {
    const lookup = await getBillBudgetByUuid(project.bill_budget_uuid);
    if (lookup.exists) {
      syncingExistingBudget = true;
    } else if (lookup.error?.startsWith("billcom_budget_missing:")) {
      const { error: clearError } = await clearMissingBillBudgetLink(supabase, project, lookup.error);
      if (clearError) {
        return NextResponse.json({ error: clearError.message }, { status: 500 });
      }
      project.bill_budget_uuid = null;
      project.bill_budget_name = null;
      project.bill_budget_last_sync_status = "missing_in_bill";
      project.bill_budget_last_sync_error = lookup.error;
    } else {
      return NextResponse.json(
        { error: lookup.error ?? "Failed to validate existing BILL budget before create" },
        { status: 502 }
      );
    }
  }

  const pmInitials = project.pm && project.pm !== "TBD" ? project.pm : null;
  let pmEmail: string | null = null;
  if (pmInitials) {
    const { data: pmRow } = await supabase
      .from("user_roles")
      .select("email, bill_spend_email")
      .eq("pm_initials", pmInitials)
      .maybeSingle();
    pmEmail = resolveBillSpendMemberEmail(pmRow);
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

  const seedResult = syncingExistingBudget && project.bill_budget_uuid
    ? await updateBillBudgetForProject({
        budgetUuid: project.bill_budget_uuid,
        projectId: project.id,
        projectName: project.name,
        jobNumber,
        billJobName: billJobNameSnapshot,
        budgetTravel: project.budget_travel ?? 0,
        budgetProps: project.budget_props ?? 0,
        pmEmail,
      })
    : await seedBillBudgetForProject({
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

  if (isBillBudgetLinkSuccess(seedResult.status)) {
    updatePayload.bill_budget_uuid = seedResult.budgetUuid ?? project.bill_budget_uuid ?? null;
    updatePayload.bill_budget_name = seedResult.budgetName ?? billJobNameSnapshot;
    if (!syncingExistingBudget) {
      updatePayload.bill_budget_seeded_at = new Date().toISOString();
      updatePayload.bill_budget_seed_source = "manual_project_trigger";
    }
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
