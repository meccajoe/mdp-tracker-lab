import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildJulyLaborReview } from "@/lib/july-labor-review";

export async function GET(request: NextRequest) {
  const actor = await requireProjectAdmin(request);
  if (!actor.ok) return actor.response;
  try { return NextResponse.json(await buildJulyLaborReview(actor.supabase, request.nextUrl.searchParams.get("projectId"))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build July labor review." }, { status: 500 }); }
}
