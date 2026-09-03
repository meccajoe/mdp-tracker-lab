import { NextResponse } from "next/server";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const { workspaceId, revisionId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "approve_commercial");
  if (!access.ok) return access.response;
  const { data, error } = await access.actorSupabase.rpc("accept_ada_quote_revision", {
    p_workspace_id: workspaceId,
    p_revision_id: revisionId,
    p_actor_email: access.actorEmail,
  });
  if (error) {
    const status = /latest reviewed/i.test(error.message) ? 409 : /not found/i.test(error.message) ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  const approved = Array.isArray(data) ? data[0] : data;
  if (!approved) return NextResponse.json({ error: "Ada quote revision not found." }, { status: 404 });
  return NextResponse.json({
    commercialApprovedRevisionId: approved.commercial_approved_revision_id,
    status: "commercial_approved",
    commercialApprovedAt: approved.commercial_approved_at,
    alreadyCommerciallyApproved: Boolean(approved.already_commercially_approved),
  });
}
