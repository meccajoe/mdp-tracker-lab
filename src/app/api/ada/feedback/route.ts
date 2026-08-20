import { NextResponse } from "next/server";

import { parseAdaFeedbackInput } from "@/lib/ada-feedback";
import { requireAdaAccess } from "@/lib/ada-server";

export async function POST(request: Request) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;

  try {
    const input = parseAdaFeedbackInput(await request.json().catch(() => ({})));
    if (input.workspaceId) {
      const { data: workspace, error: workspaceError } = await access.supabase
        .from("ada_quote_workspaces")
        .select("id, created_by_email")
        .eq("id", input.workspaceId)
        .eq("created_by_email", access.actorEmail)
        .maybeSingle();
      if (workspaceError) throw new Error(workspaceError.message);
      if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
    }

    const { data: feedback, error } = await access.supabase.from("ada_feedback").insert({
      workspace_id: input.workspaceId,
      submitted_by_email: access.actorEmail,
      category: input.category,
      message: input.message,
      page_path: input.pagePath,
      status: "new",
    }).select("id, category, status, created_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Feedback could not be saved." }, { status: 400 });
  }
}
