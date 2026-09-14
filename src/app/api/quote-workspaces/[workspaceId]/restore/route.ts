import { NextResponse } from "next/server";

import { requireQuoteProductWorkspaceAccess } from "@/lib/ada-server";

function statusForRestoreError(code: string | undefined) {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "PT409" || code === "55000" || code === "23505" || code === "P0001") return 409;
  if (code === "22023") return 400;
  return 500;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireQuoteProductWorkspaceAccess(workspaceId, "restore_workspace");
  if (!access.ok) return access.response;

  const { data: workspace, error: workspaceError } = await access.supabase
    .from("ada_quote_workspaces")
    .select("row_version")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) return NextResponse.json({ error: "Quote Workspace could not be restored." }, { status: 500 });
  if (!workspace) return NextResponse.json({ error: "Quote Workspace not found." }, { status: 404 });

  const { data, error } = await access.actorSupabase
    .rpc("restore_quote_workspace", {
      p_workspace_id: workspaceId,
      p_actor_email: access.actorEmail,
      p_expected_row_version: workspace.row_version,
      p_reason: "Operator restored workspace",
      p_idempotency_key: `workspace-restore:${workspaceId}:v${workspace.row_version}`,
    })
    .single();

  if (error) {
    const status = statusForRestoreError(error.code);
    const message = status === 500 ? "Quote Workspace could not be restored." : error.message;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ workspaceId, restored: true, event: data });
}
