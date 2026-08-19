import { NextResponse } from "next/server";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(_request: Request, context: { params: Promise<{ workspaceId: string; revisionId: string }> }) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  const { workspaceId, revisionId } = await context.params;
  const { data, error } = await access.supabase.rpc("accept_ada_quote_revision", {
    p_workspace_id: workspaceId,
    p_revision_id: revisionId,
    p_actor_email: access.actorEmail,
  });
  if (error) {
    const status = /latest reviewed/i.test(error.message) ? 409 : /not found/i.test(error.message) ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  const accepted = Array.isArray(data) ? data[0] : data;
  if (!accepted) return NextResponse.json({ error: "Ada quote revision not found." }, { status: 404 });
  return NextResponse.json({ acceptedRevisionId: accepted.accepted_revision_id, status: "accepted", acceptedAt: accepted.accepted_at, alreadyAccepted: Boolean(accepted.already_accepted) });
}
