import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

const VALID_TASK_STATUSES = new Set(["open", "in_progress", "blocked", "done"]);

export async function POST(request: NextRequest) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    title?: string;
    status?: string;
    ownerLabel?: string;
    dueDate?: string;
    needsHumanInput?: boolean;
    notes?: string;
  };

  const projectId = body.projectId?.trim();
  const title = body.title?.trim();
  if (!projectId || !title) {
    return NextResponse.json({ error: "Project and task title are required." }, { status: 400 });
  }

  const { data, error } = await admin.supabase
    .from("project_tasks")
    .insert({
      project_id: projectId,
      title,
      status: VALID_TASK_STATUSES.has(body.status ?? "") ? body.status : "open",
      owner_label: body.ownerLabel?.trim() || null,
      due_date: body.dueDate?.trim() || null,
      needs_human_input: Boolean(body.needsHumanInput),
      notes: body.notes?.trim() || null,
      created_by: admin.actorEmail,
      updated_by: admin.actorEmail,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data }, { status: 201 });
}
