import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { updateSlackDmSubscriptionStatus } from "@/lib/project-subscription-store";
import type { SubscriptionAction, SubscriptionScopeType } from "@/lib/project-subscriptions";

const PORTFOLIO_SCOPE_TYPES: SubscriptionScopeType[] = [
  "my_active_projects",
  "pm_active_projects",
  "all_active_projects",
  "saved_portfolio",
];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> }
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { subscriptionId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: SubscriptionAction };
  if (!body.action || !["pause", "resume", "delete"].includes(body.action)) {
    return NextResponse.json({ error: "action must be pause, resume, or delete" }, { status: 400 });
  }

  const result = await updateSlackDmSubscriptionStatus({
    supabase: admin.supabase,
    subscriptionId,
    action: body.action,
    slackUserId: `web:${admin.actorEmail}`,
    createdByEmail: admin.actorEmail,
    scopeTypes: PORTFOLIO_SCOPE_TYPES,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("not found") ? 404 : 500 });
  }

  return NextResponse.json({ subscription: result.data });
}
