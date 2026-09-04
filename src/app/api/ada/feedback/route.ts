import { NextResponse } from "next/server";

import { parseAdaFeedbackInput } from "@/lib/ada-feedback";
import { requireAdaAccess, requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function POST(request: Request) {
  try {
    const input = parseAdaFeedbackInput(await request.json().catch(() => ({})));
    const access = input.workspaceId
      ? await requireAdaWorkspaceAccess(input.workspaceId, "edit_draft")
      : await requireAdaAccess();
    if (!access.ok) return access.response;

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
