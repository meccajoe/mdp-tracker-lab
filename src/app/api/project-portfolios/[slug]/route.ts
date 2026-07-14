import { NextRequest, NextResponse } from "next/server";

import { deleteSavedPortfolio, updateSavedPortfolioAutomation } from "@/lib/project-saved-portfolios";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    ownerEmail?: string;
    ruleType?: "manual" | "pm_active_projects" | "all_active_projects";
    pmInitials?: string | null;
  };

  const result = await updateSavedPortfolioAutomation({
    supabase: admin.supabase,
    createdByEmail: admin.actorEmail,
    ownerEmail: typeof body.ownerEmail === "string" ? body.ownerEmail : admin.actorEmail,
    slug,
    automation: {
      rule_type: body.ruleType === "pm_active_projects" || body.ruleType === "all_active_projects" ? body.ruleType : "manual",
      pm_initials: typeof body.pmInitials === "string" ? body.pmInitials : null,
    },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Saved portfolio not found." ? 404 : 400 });
  }

  return NextResponse.json({ portfolio: result.data });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { slug } = await context.params;
  const ownerEmail = request.nextUrl.searchParams.get("ownerEmail") ?? admin.actorEmail;
  const result = await deleteSavedPortfolio({
    supabase: admin.supabase,
    createdByEmail: admin.actorEmail,
    ownerEmail,
    slug,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Saved portfolio not found." ? 404 : 400 });
  }

  return NextResponse.json({ portfolio: result.data });
}
