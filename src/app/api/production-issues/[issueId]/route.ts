import { NextRequest, NextResponse } from "next/server";

import { requireIssueActor } from "@/lib/issue-server";

const ISSUE_CATEGORIES = new Set(["defect", "rework", "safety", "site", "vendor", "labor", "other"]);
const ISSUE_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const ISSUE_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

type Params = { params: Promise<{ issueId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const actor = await requireIssueActor(request);
  if (!actor.ok) return actor.response;
  const { issueId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    category?: string; severity?: string; status?: string; title?: string; description?: string;
    ownerLabel?: string | null; costImpact?: number | null; scheduleImpactDays?: number | null;
    linkedVendor?: string | null; reportedDate?: string;
  };
  const updates: Record<string, unknown> = { updated_by: actor.actorEmail };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    updates.title = title;
  }
  if (typeof body.category === "string") {
    if (!ISSUE_CATEGORIES.has(body.category)) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    updates.category = body.category;
  }
  if (typeof body.severity === "string") {
    if (!ISSUE_SEVERITIES.has(body.severity)) return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
    updates.severity = body.severity;
  }
  if (typeof body.status === "string") {
    if (!ISSUE_STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    updates.status = body.status;
    if (["resolved", "closed"].includes(body.status)) updates.resolved_date = new Date().toISOString().slice(0, 10);
  }
  if (typeof body.description === "string") updates.description = body.description.trim() || null;
  if (typeof body.ownerLabel === "string" || body.ownerLabel === null) updates.owner_label = body.ownerLabel?.trim() || null;
  if (typeof body.linkedVendor === "string" || body.linkedVendor === null) updates.linked_vendor = body.linkedVendor?.trim() || null;
  if (typeof body.costImpact === "number" || body.costImpact === null) updates.cost_impact = Number.isFinite(body.costImpact) ? body.costImpact : null;
  if (typeof body.scheduleImpactDays === "number" || body.scheduleImpactDays === null) updates.schedule_impact_days = Number.isInteger(body.scheduleImpactDays) ? body.scheduleImpactDays : null;
  if (typeof body.reportedDate === "string") updates.reported_date = body.reportedDate;

  const { data, error } = await actor.supabase.from("production_issues").update(updates).eq("id", issueId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ issue: data });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const actor = await requireIssueActor(request);
  if (!actor.ok) return actor.response;
  const { issueId } = await params;
  const { error } = await actor.supabase.from("production_issues").delete().eq("id", issueId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
