import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

const VALID_TASK_STATUSES = new Set(["open", "in_progress", "blocked", "done"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { taskId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    status?: string;
    owner_label?: string;
    ownerLabel?: string;
    due_date?: string;
    dueDate?: string;
    needs_human_input?: boolean;
    needsHumanInput?: boolean;
    notes?: string;
  };

  const updates: Record<string, unknown> = {
    updated_by: admin.actorEmail,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.title === "string") updates.title = body.title.trim();
  if (VALID_TASK_STATUSES.has(body.status ?? "")) updates.status = body.status;
  if (typeof body.owner_label === "string" || typeof body.ownerLabel === "string") {
    updates.owner_label = (body.owner_label ?? body.ownerLabel ?? "").trim() || null;
  }
  if (typeof body.due_date === "string" || typeof body.dueDate === "string") {
    updates.due_date = (body.due_date ?? body.dueDate ?? "").trim() || null;
  }
  if (typeof body.needs_human_input === "boolean" || typeof body.needsHumanInput === "boolean") {
    updates.needs_human_input = Boolean(body.needs_human_input ?? body.needsHumanInput);
  }
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;

  const { data, error } = await admin.supabase
    .from("project_tasks")
    .update(updates)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { taskId } = await context.params;
  const { error } = await admin.supabase
    .from("project_tasks")
    .delete()
    .eq("id", taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
