import { NextRequest, NextResponse } from "next/server";

import { requireIssueActor } from "@/lib/issue-server";

const ISSUE_CATEGORIES = new Set(["defect", "rework", "safety", "site", "vendor", "labor", "other"]);
const ISSUE_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const ISSUE_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

export async function GET(request: NextRequest) {
  const actor = await requireIssueActor();
  if (!actor.ok) return actor.response;

  const params = request.nextUrl.searchParams;
  let query = actor.supabase
    .from("production_issues")
    .select("*")
    .order("reported_date", { ascending: false })
    .order("created_at", { ascending: false });

  const projectId = params.get("project_id")?.trim();
  const status = params.get("status")?.trim();
  const category = params.get("category")?.trim();
  const severity = params.get("severity")?.trim();
  if (projectId) query = query.eq("project_id", projectId);
  if (status && ISSUE_STATUSES.has(status)) query = query.eq("status", status);
  if (category && ISSUE_CATEGORIES.has(category)) query = query.eq("category", category);
  if (severity && ISSUE_SEVERITIES.has(severity)) query = query.eq("severity", severity);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ issues: data ?? [] });
}

export async function POST(request: NextRequest) {
  const actor = await requireIssueActor();
  if (!actor.ok) return actor.response;

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    category?: string;
    severity?: string;
    title?: string;
    description?: string;
    ownerLabel?: string;
    costImpact?: number;
    scheduleImpactDays?: number;
    linkedVendor?: string;
    reportedDate?: string;
  };
  const projectId = body.projectId?.trim();
  const title = body.title?.trim();
  if (!projectId || !title || !ISSUE_CATEGORIES.has(body.category ?? "")) {
    return NextResponse.json({ error: "Project, title, and valid category are required." }, { status: 400 });
  }

  const { data, error } = await actor.supabase
    .from("production_issues")
    .insert({
      project_id: projectId,
      category: body.category,
      severity: ISSUE_SEVERITIES.has(body.severity ?? "") ? body.severity : "medium",
      title,
      description: body.description?.trim() || null,
      owner_label: body.ownerLabel?.trim() || null,
      cost_impact: Number.isFinite(body.costImpact) ? body.costImpact : null,
      schedule_impact_days: Number.isInteger(body.scheduleImpactDays) ? body.scheduleImpactDays : null,
      linked_vendor: body.linkedVendor?.trim() || null,
      reported_date: body.reportedDate?.trim() || new Date().toISOString().slice(0, 10),
      reported_by: actor.actorEmail,
      created_by: actor.actorEmail,
      updated_by: actor.actorEmail,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ issue: data }, { status: 201 });
}
