import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";

function optionalText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = optionalText(body.title);
  if (!title) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  const { data, error } = await access.supabase.from("ada_quote_projects").update({ title, client_name: optionalText(body.clientName) }).eq("id", projectId).eq("created_by_email", access.actorEmail).select("id, title, client_name, updated_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ada project not found." }, { status: 404 });
  return NextResponse.json({ project: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  const { projectId } = await context.params;
  const { data, error } = await access.supabase.from("ada_quote_projects").delete().eq("id", projectId).eq("created_by_email", access.actorEmail).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ada project not found." }, { status: 404 });
  return NextResponse.json({ deletedProjectId: projectId });
}
