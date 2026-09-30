import { NextRequest, NextResponse } from "next/server";

import { quoteWorkspaceActions, type QuoteCapability, type QuoteWorkspaceRole } from "@/lib/quote-permissions";
import { requireAdaIdentity } from "@/lib/ada-server";

const WORKSPACE_STATUSES = ["draft", "gathering_inputs", "estimating", "in_review", "accepted", "handed_off", "archived"] as const;
type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isWorkspaceStatus(value: unknown): value is WorkspaceStatus {
  return typeof value === "string" && WORKSPACE_STATUSES.includes(value as WorkspaceStatus);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdaIdentity();
  if (!admin.ok) return admin.response;

  const status = request.nextUrl.searchParams.get("status");
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const { data: memberships, error: membershipError } = await admin.supabase
    .from("quote_workspace_members")
    .select("workspace_id, workspace_role")
    .eq("user_id", admin.actorId)
    .eq("email_normalized", admin.actorEmail)
    .is("removed_at", null);
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  const workspaceIds = (memberships ?? []).map((membership) => membership.workspace_id);
  if (workspaceIds.length === 0) return NextResponse.json({ workspaces: [] });

  const { data: capabilities, error: capabilityError } = await admin.supabase
    .from("quote_user_capabilities")
    .select("capability")
    .eq("user_id", admin.actorId)
    .eq("email_normalized", admin.actorEmail)
    .is("revoked_at", null);
  if (capabilityError) return NextResponse.json({ error: "Unable to verify workspace actions." }, { status: 500 });

  let query = admin.supabase
    .from("ada_quote_workspaces")
    .select("id, ada_project_id, title, client_name, contact_name, hubspot_deal_id, tracker_project_id, status, lifecycle_status, last_activity_at, pinned_at, archived_at, created_by_email, created_at, updated_at")
    .in("id", workspaceIds)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_activity_at", { ascending: false })
    .limit(100);

  if (status === "archived") query = query.eq("status", "archived");
  else if (isWorkspaceStatus(status)) query = query.eq("status", status);
  else query = query.neq("status", "archived");
  if (search) {
    const escaped = search.replace(/[,%]/g, " ");
    query = query.or(`title.ilike.%${escaped}%,client_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,hubspot_deal_id.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roles = new Map((memberships ?? []).map((member) => [member.workspace_id, member.workspace_role]));
  return NextResponse.json({ workspaces: (data ?? []).map((workspace) => ({
    ...workspace,
    actions: quoteWorkspaceActions({
      email: admin.actorEmail,
      systemRole: admin.actorRole,
      workspaceRole: roles.get(workspace.id) as QuoteWorkspaceRole,
      isActiveMember: true,
      capabilities: (capabilities ?? []).map((row) => row.capability as QuoteCapability),
    }, workspace.lifecycle_status),
  })) });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdaIdentity();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = normalizeOptionalText(body.title);
  const adaProjectId = normalizeOptionalText(body.adaProjectId);
  if (!title) return NextResponse.json({ error: "Quote title is required." }, { status: 400 });

  const { data, error } = await admin.actorSupabase
    .rpc("create_quote_workspace", {
      p_title: title,
      p_ada_project_id: adaProjectId,
      p_client_name: normalizeOptionalText(body.clientName),
      p_contact_name: normalizeOptionalText(body.contactName),
      p_hubspot_deal_id: normalizeOptionalText(body.hubspotDealId),
    })
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workspace: data }, { status: 201 });
}
