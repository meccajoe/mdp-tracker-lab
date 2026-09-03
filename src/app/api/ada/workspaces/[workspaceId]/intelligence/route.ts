import { NextRequest, NextResponse } from "next/server";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId); if (!access.ok) return access.response;
  const query = request.nextUrl.searchParams.get("query") ?? "";
  return NextResponse.json(await retrieveAdaIntelligence(access.supabase, query, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: null }));
}
