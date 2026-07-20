import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export async function POST(request: NextRequest) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    eventDate?: string;
    eventType?: string;
    summary?: string;
    details?: string;
  };

  const projectId = body.projectId?.trim();
  const summary = body.summary?.trim();
  if (!projectId || !summary) {
    return NextResponse.json({ error: "Project and summary are required." }, { status: 400 });
  }

  const { data, error } = await admin.supabase
    .from("project_activity_events")
    .insert({
      project_id: projectId,
      event_date: body.eventDate?.trim() || new Date().toISOString().slice(0, 10),
      event_type: body.eventType?.trim() || "update",
      summary,
      details: body.details?.trim() || null,
      created_by: admin.actorEmail,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
}
