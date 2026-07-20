import { NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

const ACTIVE_PROJECT_STATUSES = ["Active", "Pending", "On Hold"];

export async function GET() {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { data: projects, error: projectError } = await admin.supabase
    .from("project_summary")
    .select("*")
    .in("status", ACTIVE_PROJECT_STATUSES)
    .order("id", { ascending: true });

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  const projectIds = (projects ?? []).map((project: { id: string | number }) => String(project.id));
  if (projectIds.length === 0) {
    return NextResponse.json({ projects: [], states: [], tasks: [], events: [] });
  }

  const [stateResult, taskResult, eventResult] = await Promise.all([
    admin.supabase
      .from("project_operational_state")
      .select("*")
      .in("project_id", projectIds),
    admin.supabase
      .from("project_tasks")
      .select("*")
      .in("project_id", projectIds)
      .order("sort_order", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin.supabase
      .from("project_activity_events")
      .select("*")
      .in("project_id", projectIds)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (stateResult.error) {
    return NextResponse.json({ error: stateResult.error.message }, { status: 500 });
  }
  if (taskResult.error) {
    return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
  }
  if (eventResult.error) {
    return NextResponse.json({ error: eventResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    projects: projects ?? [],
    states: stateResult.data ?? [],
    tasks: taskResult.data ?? [],
    events: eventResult.data ?? [],
  });
}
