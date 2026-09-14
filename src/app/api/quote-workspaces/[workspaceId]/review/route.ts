import { NextResponse } from "next/server";

import { requireQuoteProductWorkspaceAccess } from "@/lib/ada-server";

type ReviewException = {
  id: string;
  area: "revision" | "commercial_line" | "labor_allocation";
  severity: "blocking" | "review";
  message: string;
  recordId: string;
};

function errorResponse(error: { message?: string } | null | undefined) {
  return NextResponse.json({ error: error?.message ?? "Quote review data could not load." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireQuoteProductWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;

  const [workspaceResult, revisionsResult, workPackagesResult, workTypesResult, eventsResult] = await Promise.all([
    access.supabase
      .from("ada_quote_workspaces")
      .select("id, title, workspace_number, lifecycle_status, current_revision_id, commercial_approved_revision_id, hubspot_published_revision_id, customer_accepted_revision_id, operationally_released_revision_id, tracker_project_id, row_version")
      .eq("id", workspaceId)
      .maybeSingle(),
    access.supabase
      .from("ada_quote_revisions")
      .select("id, workspace_id, revision_number, revision_kind, parent_revision_id, supersedes_revision_id, normalization_status, normalization_exception, formula_policy_version, currency, created_from, locked_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("revision_number", { ascending: false }),
    access.supabase
      .from("work_packages")
      .select("id, workspace_id, project_id, item_number, display_name, parent_work_package_id, quantity, unit, classification, status, archived_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("item_number"),
    access.supabase
      .from("work_types")
      .select("id, code, display_name, category, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
    access.supabase
      .from("quote_workflow_events")
      .select("event_id, revision_id, event_type, actor_email, actor_role, prior_state, resulting_state, reason, occurred_at")
      .eq("workspace_id", workspaceId)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  const baseError = workspaceResult.error ?? revisionsResult.error ?? workPackagesResult.error ?? workTypesResult.error ?? eventsResult.error;
  if (baseError) return errorResponse(baseError);
  if (!workspaceResult.data) return NextResponse.json({ error: "Quote Workspace not found." }, { status: 404 });

  const workspace = workspaceResult.data;
  const revisions = revisionsResult.data ?? [];
  const currentRevision = revisions.find((revision: { id: string }) => revision.id === workspace.current_revision_id) ?? null;
  if (!currentRevision) {
    return NextResponse.json({
      workspace,
      currentRevision: null,
      revisions,
      commercialLines: [],
      revisionWorkPackages: [],
      workPackages: workPackagesResult.data ?? [],
      lineMappings: [],
      laborAllocations: [],
      workTypes: workTypesResult.data ?? [],
      events: eventsResult.data ?? [],
      exceptions: [{ id: "missing-current-revision", area: "revision", severity: "review", message: "No current normalized revision is selected.", recordId: workspaceId }],
    });
  }

  const revisionId = currentRevision.id;
  const [linesResult, revisionPackagesResult, mappingsResult, laborResult] = await Promise.all([
    access.supabase
      .from("quote_revision_lines")
      .select("id, logical_line_id, sort_order, sku, name, description, line_type, quantity, unit, final_sell_price, formula_type, formula_status, production_mapping_status, commercial_only_reason, materials_other_budget, quoted_hours, labor_budget, build_budget, margin_amount, margin_pct")
      .eq("revision_id", revisionId)
      .order("sort_order"),
    access.supabase
      .from("quote_revision_work_packages")
      .select("id, revision_id, work_package_id, display_name, description, line_type, quantity, unit, resale_classification, materials_other_budget, total_quoted_hours, labor_budget, production_notes, sort_order")
      .eq("revision_id", revisionId)
      .order("sort_order"),
    access.supabase
      .from("quote_revision_line_work_packages")
      .select("id, commercial_line_id, revision_work_package_id, mapping_status, allocation_basis, allocated_quantity, allocated_sell_amount, allocated_hours, allocation_pct, notes")
      .eq("revision_id", revisionId),
    access.supabase
      .from("quote_revision_work_package_labor")
      .select("id, revision_work_package_id, work_type_id, quoted_hours, quoted_labor_value, allocation_origin, allocation_status, notes")
      .eq("revision_id", revisionId),
  ]);

  const childError = linesResult.error ?? revisionPackagesResult.error ?? mappingsResult.error ?? laborResult.error;
  if (childError) return errorResponse(childError);

  const commercialLines = linesResult.data ?? [];
  const laborAllocations = laborResult.data ?? [];
  const exceptions: ReviewException[] = [];
  if (currentRevision.normalization_status !== "normalized") {
    exceptions.push({
      id: `revision:${revisionId}`,
      area: "revision",
      severity: "blocking",
      message: currentRevision.normalization_exception || `Revision normalization is ${currentRevision.normalization_status}.`,
      recordId: revisionId,
    });
  }
  for (const line of commercialLines) {
    if (line.formula_status !== "complete") exceptions.push({ id: `formula:${line.id}`, area: "commercial_line", severity: "blocking", message: `${line.name} has formula status ${line.formula_status}.`, recordId: line.id });
    if (line.production_mapping_status === "needs_review") exceptions.push({ id: `mapping:${line.id}`, area: "commercial_line", severity: "blocking", message: `${line.name} needs Build Item mapping review.`, recordId: line.id });
  }
  for (const allocation of laborAllocations) {
    if (allocation.allocation_status !== "allocated") exceptions.push({ id: `labor:${allocation.id}`, area: "labor_allocation", severity: "blocking", message: `Labor allocation is ${allocation.allocation_status}.`, recordId: allocation.id });
  }

  return NextResponse.json({
    workspace,
    currentRevision,
    revisions,
    commercialLines,
    revisionWorkPackages: revisionPackagesResult.data ?? [],
    workPackages: workPackagesResult.data ?? [],
    lineMappings: mappingsResult.data ?? [],
    laborAllocations,
    workTypes: workTypesResult.data ?? [],
    events: eventsResult.data ?? [],
    exceptions,
  });
}
