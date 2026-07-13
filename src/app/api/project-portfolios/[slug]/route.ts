import { NextResponse } from "next/server";

import { deleteSavedPortfolio } from "@/lib/project-saved-portfolios";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const admin = await requireProjectAdmin();
  if (!admin.ok) {
    return admin.response;
  }

  const { slug } = await context.params;
  const result = await deleteSavedPortfolio({
    supabase: admin.supabase,
    createdByEmail: admin.actorEmail,
    slug,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Saved portfolio not found." ? 404 : 400 });
  }

  return NextResponse.json({ portfolio: result.data });
}
