import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

const VALID_OPERATIONAL_STATUSES = new Set([
  "on_track",
  "needs_follow_up",
  "blocked",
  "waiting_on_client",
  "waiting_on_internal",
  "waiting_on_vendor",
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { projectId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    operationalStatus?: string;
    nextAction?: string;
    blockerSummary?: string;
    pendingHumanInput?: string;
    contextNotes?: string;
    targetDate?: string;
  };

  const operationalStatus = VALID_OPERATIONAL_STATUSES.has(body.operationalStatus ?? "")
    ? body.operationalStatus!
    : "on_track";

  const payload = {
    project_id: String(projectId),
    operational_status: operationalStatus,
    next_action: body.nextAction?.trim() || null,
    blocker_summary: body.blockerSummary?.trim() || null,
    pending_human_input: body.pendingHumanInput?.trim() || null,
    context_notes: body.contextNotes?.trim() || null,
    target_date: body.targetDate?.trim() || null,
    updated_by: admin.actorEmail,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.supabase
    .from("project_operational_state")
    .upsert(payload, { onConflict: "project_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ state: data });
}
