import { NextRequest, NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { removePortfolioProjectMembership, upsertPortfolioProjectMembership } from "@/lib/project-saved-portfolios";

export async function POST(
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
    projectId?: string;
    monitorKeys?: string[];
  };

  const result = await upsertPortfolioProjectMembership({
    supabase: admin.supabase,
    createdByEmail: admin.actorEmail,
    ownerEmail: typeof body.ownerEmail === "string" ? body.ownerEmail : admin.actorEmail,
    slug,
    projectId: body.projectId ?? "",
    monitorKeys: Array.isArray(body.monitorKeys) ? body.monitorKeys : [],
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
  const body = (await request.json().catch(() => ({}))) as {
    ownerEmail?: string;
    projectId?: string;
  };

  const result = await removePortfolioProjectMembership({
    supabase: admin.supabase,
    createdByEmail: admin.actorEmail,
    ownerEmail: typeof body.ownerEmail === "string" ? body.ownerEmail : admin.actorEmail,
    slug,
    projectId: body.projectId ?? "",
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Saved portfolio not found." ? 404 : 400 });
  }

  return NextResponse.json({ portfolio: result.data });
}
