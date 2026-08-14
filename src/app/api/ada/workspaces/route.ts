import { NextRequest, NextResponse } from "next/server";

import { requireAdaAccess } from "@/lib/ada-server";

const WORKSPACE_STATUSES = ["draft", "gathering_inputs", "estimating", "in_review", "accepted", "handed_off", "archived"] as const;
type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isWorkspaceStatus(value: unknown): value is WorkspaceStatus {
  return typeof value === "string" && WORKSPACE_STATUSES.includes(value as WorkspaceStatus);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdaAccess();
  if (!admin.ok) return admin.response;

  const status = request.nextUrl.searchParams.get("status");
  const search = request.nextUrl.searchParams.get("search")?.trim();
  let query = admin.supabase
    .from("ada_quote_workspaces")
    .select("id, ada_project_id, title, client_name, contact_name, hubspot_deal_id, tracker_project_id, status, last_activity_at, pinned_at, archived_at, created_by_email, created_at, updated_at")
    .eq("created_by_email", admin.actorEmail)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_activity_at", { ascending: false })
    .limit(100);

  if (isWorkspaceStatus(status)) query = query.eq("status", status);
  if (search) {
    const escaped = search.replace(/[,%]/g, " ");
    query = query.or(`title.ilike.%${escaped}%,client_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,hubspot_deal_id.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workspaces: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdaAccess();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = normalizeOptionalText(body.title);
  const adaProjectId = normalizeOptionalText(body.adaProjectId);
  if (!title) return NextResponse.json({ error: "Quote title is required." }, { status: 400 });

  if (adaProjectId) {
    const { data: project, error: projectError } = await admin.supabase.from("ada_quote_projects").select("id").eq("id", adaProjectId).maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: "Ada project not found." }, { status: 404 });
  }

  const { data, error } = await admin.supabase
    .from("ada_quote_workspaces")
    .insert({
      title,
      ada_project_id: adaProjectId,
      client_name: normalizeOptionalText(body.clientName),
      contact_name: normalizeOptionalText(body.contactName),
      hubspot_deal_id: normalizeOptionalText(body.hubspotDealId),
      status: "draft",
      created_by_email: admin.actorEmail,
    })
    .select("id, ada_project_id, title, client_name, contact_name, hubspot_deal_id, tracker_project_id, status, last_activity_at, pinned_at, archived_at, created_by_email, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: conceptError } = await admin.supabase
    .from("ada_quote_concepts")
    .insert({ workspace_id: data.id, label: "Concept 1", mode: "standard", status: "draft", created_by_email: admin.actorEmail });

  if (conceptError) return NextResponse.json({ error: conceptError.message }, { status: 500 });
  return NextResponse.json({ workspace: data }, { status: 201 });
}
