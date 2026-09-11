import { NextResponse } from "next/server";

import { requireAdaIdentity } from "@/lib/ada-server";

export async function GET() {
  const access = await requireAdaIdentity();
  if (!access.ok) return access.response;

  const [membershipResult, capabilityResult] = await Promise.all([
    access.supabase
      .from("quote_workspace_members")
      .select("workspace_id")
      .eq("user_id", access.actorId)
      .eq("email_normalized", access.actorEmail)
      .is("removed_at", null)
      .limit(1),
    access.supabase
      .from("quote_user_capabilities")
      .select("capability")
      .eq("user_id", access.actorId)
      .eq("email_normalized", access.actorEmail)
      .eq("capability", "create_workspace")
      .is("revoked_at", null)
      .limit(1),
  ]);

  if (membershipResult.error || capabilityResult.error) {
    return NextResponse.json({ error: "Unable to verify Quote Workspace access." }, { status: 500 });
  }

  const canViewQuotes = Boolean(membershipResult.data?.length || capabilityResult.data?.length);
  if (!canViewQuotes) {
    return NextResponse.json({ error: "Quote Workspace access required." }, { status: 403 });
  }

  return NextResponse.json({ allowed: true, actorEmail: access.actorEmail });
}
