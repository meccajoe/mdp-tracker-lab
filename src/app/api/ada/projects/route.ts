import { NextResponse } from "next/server";

import { requireAdaAccess } from "@/lib/ada-server";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;

  const { data, error } = await access.supabase
    .from("ada_quote_projects")
    .select("id, title, client_name, created_at, updated_at")
    .eq("created_by_email", access.actorEmail)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = optionalText(body.title);
  if (!title) return NextResponse.json({ error: "Project name is required." }, { status: 400 });

  const { data, error } = await access.supabase
    .from("ada_quote_projects")
    .insert({ title, client_name: optionalText(body.clientName), created_by_email: access.actorEmail })
    .select("id, title, client_name, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}
