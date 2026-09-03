import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { buildLaborReview } from "@/lib/july-labor-review";
import { parseLaborReviewPeriod } from "@/lib/labor-review-period";

export async function GET(request: NextRequest) {
  const actor = await requireProjectAdmin(request);
  if (!actor.ok) return actor.response;
  try {
    const period = parseLaborReviewPeriod(request.nextUrl.searchParams.get("start"), request.nextUrl.searchParams.get("end"));
    return NextResponse.json(await buildLaborReview(actor.supabase, period, request.nextUrl.searchParams.get("projectId")));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build labor review." }, { status: 400 }); }
}
