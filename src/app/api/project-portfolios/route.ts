import { NextRequest, NextResponse } from "next/server";

import { listSavedPortfolios, upsertSavedPortfolio } from "@/lib/project-saved-portfolios";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export async function GET() {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const result = await listSavedPortfolios({
    supabase: admin.supabase,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ portfolios: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    projectIds?: string[];
  };

  const result = await upsertSavedPortfolio({
    supabase: admin.supabase,
    createdByEmail: admin.actorEmail,
    name: body.name ?? "",
    projectIds: Array.isArray(body.projectIds) ? body.projectIds : [],
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ portfolio: result.data }, { status: 201 });
}
