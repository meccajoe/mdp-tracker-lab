import { NextRequest, NextResponse } from "next/server";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { requireAdaAccess } from "@/lib/ada-server";

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const access = await requireAdaAccess();
  if (!access.ok) return access.response;
  const { workspaceId } = await context.params;
  const { data: workspace } = await access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Ada chat not found." }, { status: 404 });
  const query = request.nextUrl.searchParams.get("query") ?? "";
  return NextResponse.json(await retrieveAdaIntelligence(access.supabase, query));
}
